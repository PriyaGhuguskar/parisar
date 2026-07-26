// Unit tests for the non-Supabase logic in src/flat-actions.js.
// Real DB behavior (per-flat RLS, admin-only issue/waive, fine lifecycle) is
// exercised by tests/isolation/flat-actions.test.js (Plan 06-01).
//
// supabase-js v2 thenable quirk: the query builder is a thenable, NOT a Promise —
// NEVER attach `.catch` to a builder chain. We mock `rpc`/`from` to return resolved
// { data, error } shapes and assert the wrapper branches on `error`.

import { describe, expect, it, vi } from "vitest";
import {
  acknowledgeFine,
  FINE_STATUS,
  FLAT_ACTION_KIND,
  issueFlatAction,
  subscribeFlatActions,
  waiveFine,
} from "../flat-actions.js";

function makeRpcClient(rpcImpl) {
  return { rpc: vi.fn(rpcImpl) };
}

function makeChannelClient() {
  const subscribeFn = vi.fn(function subscribeFn(cb) {
    if (cb) cb("SUBSCRIBED");
    return this;
  });
  const onFn = vi.fn(function onFn() {
    return this;
  });
  const channel = { on: onFn, subscribe: subscribeFn };
  const channelFn = vi.fn(() => channel);
  const removeChannel = vi.fn();
  return { client: { channel: channelFn, removeChannel }, channel, onFn, removeChannel };
}

// ---------------------------------------------------------------------------
// Enum re-export
// ---------------------------------------------------------------------------

describe("enum re-export", () => {
  it("re-exports FLAT_ACTION_KIND with warning + fine + notify", () => {
    expect(FLAT_ACTION_KIND.WARNING).toBe("warning");
    expect(FLAT_ACTION_KIND.FINE).toBe("fine");
    expect(FLAT_ACTION_KIND.NOTIFY).toBe("notify");
  });

  it("re-exports FINE_STATUS with NO 'overdue' value", () => {
    expect(FINE_STATUS.OUTSTANDING).toBe("outstanding");
    expect(FINE_STATUS.ACKNOWLEDGED).toBe("acknowledged");
    expect(FINE_STATUS.WAIVED).toBe("waived");
    expect(Object.values(FINE_STATUS)).not.toContain("overdue");
  });
});

// ---------------------------------------------------------------------------
// issueFlatAction — maps p_ named params, passes kind/amount/dueDate through
// ---------------------------------------------------------------------------

describe("issueFlatAction", () => {
  it("passes kind/amount/dueDate through to rpc('issue_flat_action') with p_ names", async () => {
    const supabase = makeRpcClient(async () => ({
      // The migration RPC returns { flat_action_id, society_id } (NOT action_id).
      data: { flat_action_id: "fa-1", society_id: "soc-1" },
      error: null,
    }));
    const result = await issueFlatAction(supabase, {
      flatId: "flat-1",
      kind: "fine",
      body: "Late maintenance",
      amount: 500,
      dueDate: "2026-06-30",
      storageKey: "soc-1/flat_actions/fa-1/doc.pdf",
      mimeType: "application/pdf",
      byteSize: 1234,
    });
    expect(result).toEqual({ actionId: "fa-1", societyId: "soc-1" });
    expect(supabase.rpc).toHaveBeenCalledWith("issue_flat_action", {
      p_flat_id: "flat-1",
      p_kind: "fine",
      p_body: "Late maintenance",
      p_amount: 500,
      p_due_date: "2026-06-30",
      p_storage_key: "soc-1/flat_actions/fa-1/doc.pdf",
      p_mime_type: "application/pdf",
      p_byte_size: 1234,
    });
  });

  it("defaults amount/dueDate/attachment fields to null for a warning", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { flat_action_id: "fa-2", society_id: "soc-1" },
      error: null,
    }));
    await issueFlatAction(supabase, {
      flatId: "flat-1",
      kind: "warning",
      body: "Noise complaint",
    });
    const args = supabase.rpc.mock.calls[0][1];
    expect(args.p_amount).toBeNull();
    expect(args.p_due_date).toBeNull();
    expect(args.p_storage_key).toBeNull();
    expect(args.p_mime_type).toBeNull();
    expect(args.p_byte_size).toBeNull();
  });

  it("propagates a named RPC error (INSUFFICIENT_ROLE / FINE_FIELDS_REQUIRED)", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(
      issueFlatAction(supabase, { flatId: "flat-1", kind: "warning", body: "x" }),
    ).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// acknowledgeFine — returns the RPC jsonb straight through; does NOT throw on
// a business-outcome {ok:false}
// ---------------------------------------------------------------------------

describe("acknowledgeFine", () => {
  it("returns the jsonb result straight through on success", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, status: "acknowledged" },
      error: null,
    }));
    const result = await acknowledgeFine(supabase, "fa-1");
    expect(result).toEqual({ ok: true, status: "acknowledged" });
    expect(supabase.rpc).toHaveBeenCalledWith("acknowledge_fine", { p_action_id: "fa-1" });
  });

  it("returns {ok:false, reason} WITHOUT throwing", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: false, reason: "not_outstanding" },
      error: null,
    }));
    const result = await acknowledgeFine(supabase, "fa-1");
    expect(result).toEqual({ ok: false, reason: "not_outstanding" });
  });

  it("throws only on a genuine transport/RLS error", async () => {
    const err = new Error("network");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(acknowledgeFine(supabase, "fa-1")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// waiveFine — admin-only (server-gated). Surfaces INSUFFICIENT_ROLE cleanly as a
// typed {ok:false, reason:'insufficient_role'} result, never a raw throw.
// ---------------------------------------------------------------------------

describe("waiveFine", () => {
  it("returns the jsonb result straight through on success", async () => {
    const supabase = makeRpcClient(async () => ({
      data: { ok: true, status: "waived" },
      error: null,
    }));
    const result = await waiveFine(supabase, "fa-1");
    expect(result).toEqual({ ok: true, status: "waived" });
    expect(supabase.rpc).toHaveBeenCalledWith("waive_fine", { p_action_id: "fa-1" });
  });

  it("surfaces INSUFFICIENT_ROLE as a typed {ok:false, reason} result (not a throw)", async () => {
    const err = new Error("INSUFFICIENT_ROLE");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    const result = await waiveFine(supabase, "fa-1");
    expect(result).toEqual({ ok: false, reason: "insufficient_role" });
  });

  it("still throws on a non-role transport error", async () => {
    const err = new Error("network down");
    const supabase = makeRpcClient(async () => ({ data: null, error: err }));
    await expect(waiveFine(supabase, "fa-1")).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// subscribeFlatActions — per-society + per-flat INSERT channel
// ---------------------------------------------------------------------------

describe("subscribeFlatActions", () => {
  it("subscribes to INSERT on flat_actions filtered by society_id + flat_id", () => {
    const { client, channel, onFn, removeChannel } = makeChannelClient();
    const handlers = { onInsert: vi.fn(), onConnected: vi.fn() };

    const cleanup = subscribeFlatActions(client, {
      societyId: "soc-1",
      flatId: "flat-1",
      ...handlers,
    });

    expect(client.channel).toHaveBeenCalledWith("flat-actions-soc-1-flat-1");
    expect(onFn.mock.calls[0][1]).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "flat_actions",
      filter: "flat_id=eq.flat-1",
    });
    expect(handlers.onConnected).toHaveBeenCalledOnce();

    onFn.mock.calls[0][2]({ new: { id: "fa-1", kind: "fine" } });
    expect(handlers.onInsert).toHaveBeenCalledWith({ id: "fa-1", kind: "fine" });

    cleanup();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("scopes by society only (board, all flats) when flatId is omitted", () => {
    const { client, onFn } = makeChannelClient();
    subscribeFlatActions(client, { societyId: "soc-1", onInsert: vi.fn() });
    expect(client.channel).toHaveBeenCalledWith("flat-actions-soc-1");
    expect(onFn.mock.calls[0][1].filter).toBe("society_id=eq.soc-1");
  });
});
