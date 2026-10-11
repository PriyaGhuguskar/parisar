import {
  Building2,
  Check,
  ClipboardList,
  Copy,
  IndianRupee,
  MapPin,
  MessageSquare,
  Phone,
  Power,
  Users,
} from "lucide-react";
import { AdminAuthorities } from "../AdminAuthorities";
import { AdminService } from "../AdminService";

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon
        size={15}
        strokeWidth={2.2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--color-neutral-400)]"
      />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[var(--color-neutral-400)]">{label}</p>
        <div className="mt-0.5 text-[14px] text-[var(--color-neutral-900)]">{children}</div>
      </div>
    </div>
  );
}

export function OverviewPane({
  societyId,
  onChanged,
  s,
  features,
  featureTotal,
  pendingRequests,
  copied,
  setCopied,
  setPane,
}) {
  return (
    <div className="divide-y divide-[var(--color-neutral-200)]">
      <Row icon={Power} label="Service">
        <AdminService societyId={societyId} onChanged={onChanged} />
      </Row>
      <Row icon={MapPin} label="Address">
        {s.address ?? "—"}
        {s.landmark ? (
          <span className="block text-[13px] text-[var(--color-neutral-600)]">
            Landmark: {s.landmark}
          </span>
        ) : null}
      </Row>
      <Row icon={Phone} label="Society Authorities">
        <AdminAuthorities societyId={societyId} onChanged={onChanged} />
      </Row>
      <Row icon={Building2} label="Join code">
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-[15px] font-bold tracking-[0.1em]">{s.code ?? "—"}</span>
          {s.code ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(s.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* clipboard blocked — the code is on screen anyway */
                }
              }}
              className="pk-press rounded-md p-1 text-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-100)]"
              aria-label="Copy join code"
            >
              {copied ? (
                <Check size={13} strokeWidth={3} className="text-[var(--color-brand-600)]" />
              ) : (
                <Copy size={13} strokeWidth={2.4} />
              )}
            </button>
          ) : null}
        </span>
      </Row>
      <Row icon={Users} label="Residents">
        <span className="tabular-nums font-semibold">{s.member_count}</span> active
        {Number(s.pending_count) > 0 ? (
          <span className="ml-2 rounded-full bg-[#FDF0DF] px-2 py-0.5 text-[12px] font-bold text-[#8A4708]">
            {s.pending_count} pending approval
          </span>
        ) : null}
      </Row>
      <Row icon={IndianRupee} label="Monthly fee (paid add-ons)">
        <span className="font-semibold tabular-nums">
          ₹{featureTotal.toLocaleString("en-IN")}/mo
        </span>
        <span className="ml-2 text-[13px] text-[var(--color-neutral-600)]">
          {features.filter((f) => f.enabled && !f.is_core).length} add-on(s) on ·{" "}
          <button
            type="button"
            onClick={() => setPane("monthly")}
            className="font-semibold text-[var(--color-brand-600)] hover:underline"
          >
            month by month
          </button>
        </span>
      </Row>
      {pendingRequests > 0 ? (
        <Row icon={ClipboardList} label="Feature requests">
          <button
            type="button"
            onClick={() => setPane("requests")}
            className="rounded-full bg-[#FDF0DF] px-2 py-0.5 text-[12px] font-bold text-[#8A4708] hover:underline"
          >
            {pendingRequests} waiting for a decision
          </button>
        </Row>
      ) : null}
      <Row icon={MessageSquare} label="Created">
        {new Date(s.created_at).toLocaleString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </Row>
    </div>
  );
}
