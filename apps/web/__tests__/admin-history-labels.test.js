import { describe, expect, it } from "vitest";
import { categoryOf, describeEvent, isVisible } from "../components/admin/insights/historyLabels";

describe("admin history labels", () => {
  it("describes account events with money and names", () => {
    expect(
      describeEvent({
        action: "society.created_by_admin",
        payload: { authorities: [{ name: "Asha" }, { name: "Bala" }], request_id: "r1" },
      }),
    ).toEqual({
      title: "Society created",
      detail: "Authorities: Asha, Bala · From an enrolment request",
    });
    expect(
      describeEvent({
        action: "feature.changed",
        feature_name: "Polls",
        payload: { enabled: true, price_override: 150 },
      }),
    ).toEqual({ title: "Polls turned ON", detail: "Price for this society: ₹150/mo" });
    expect(
      describeEvent({
        action: "feature.requested",
        feature_name: "Polls",
        payload: { request: "remove", note: "costly" },
      }),
    ).toEqual({ title: "Requested to remove Polls", detail: "“costly”" });
    expect(
      describeEvent({
        action: "payment.recorded",
        payload: { amount: 1500, method: "upi", paid_on: "2026-09-01" },
      }),
    ).toEqual({
      title: "Payment recorded: ₹1,500",
      detail: "upi · 2026-09-01",
    });
  });

  it("labels service stop / block / resume with the reason", () => {
    expect(
      describeEvent({ action: "society.service_blocked", payload: { reason: "Fraud" } }),
    ).toEqual({
      title: "Society blocked",
      detail: "“Fraud”",
    });
    expect(describeEvent({ action: "society.service_resumed", payload: {} }).title).toBe(
      "Service resumed",
    );
    expect(categoryOf("society.service_paused")).toBe("account");
  });

  it("falls back to a readable title for unknown actions", () => {
    expect(describeEvent({ action: "complaint.filed", payload: {} }).title).toBe("Complaint filed");
  });

  it("categorises and hides noise", () => {
    expect(categoryOf("billing.updated")).toBe("account");
    expect(categoryOf("authority.added")).toBe("account");
    expect(categoryOf("member.joined")).toBe("setup");
    expect(categoryOf("complaint.filed")).toBe("activity");
    expect(isVisible({ action: "pin.set" })).toBe(false);
    expect(isVisible({ action: "billing.updated" })).toBe(true);
  });
});
