"use client";

// PollBlock — embedded poll inside a notice detail (web). The anti-bandwagon
// centerpiece (UI-SPEC Screen 4, DD-4).
//
// THREE states:
//   State A (open, NOT voted): shadcn RadioGroup of options + Vote button.
//     CRITICAL anti-bandwagon gate (T-05-16): NO tally / counts / bars are in the
//     rendered tree, and getPollTally / subscribeToVotes are NOT called until
//     votePollAction resolves. Screen-reader users also cannot read the tally.
//   State B (voted, open): a result bar per option (brand.500 fill over a
//     neutral.100 track) + "{{total}} votes" + Change vote. Live tally recomputed
//     from poll_votes rows on every Realtime event (Pitfall 5).
//   State C (closed): same result reveal regardless of whether the user voted.
//
// Board (author or any board role) sees a "Close poll" button while open →
// closePollAction → State C via Realtime/local.
//
// aria-live="polite" announces "Vote recorded. Results now visible." on vote.

import { getPollTally, subscribeToVotes } from "@parisar/api-client";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusPill, SurfaceCard } from "@/components/kit";
import { closePollAction, votePollAction } from "../../app/actions/notifications";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2";

/**
 * @param {{
 *   poll: { id: string, question: string, status: 'open'|'closed' },
 *   options: Array<{ id: string, label: string, position: number }>,
 *   myVote: { id: string, option_id: string }|null,
 *   role: string,
 *   isAuthor?: boolean,
 * }} props
 */
export function PollBlock({ poll, options, myVote, role, isAuthor = false }) {
  const { t } = useTranslation("polls");
  const isBoard = BOARD_ROLES.has(role) || isAuthor;

  const [status, setStatus] = useState(poll.status);
  const [votedOptionId, setVotedOptionId] = useState(myVote?.option_id ?? null);
  // "changing" lets a voted user re-open State A to update their choice.
  const [changing, setChanging] = useState(false);
  const [selected, setSelected] = useState(myVote?.option_id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [announce, setAnnounce] = useState("");
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const [tally, setTally] = useState({ counts: [], total: 0 });
  const cleanupRef = useRef(null);

  const closed = status === "closed";
  const hasVoted = votedOptionId != null;
  // Results are revealed ONLY when the user has voted (and isn't actively
  // changing) OR the poll is closed. State A renders no tally branch at all.
  const showResults = (hasVoted && !changing) || closed;

  const refreshTally = useCallback(
    async (supabase) => {
      try {
        const result = await getPollTally(supabase, poll.id);
        setTally(result);
      } catch {
        // Leave the last-known tally; a transient read error is non-fatal.
      }
    },
    [poll.id],
  );

  // Live tally — subscribe ONLY once results are visible (anti-bandwagon: no
  // tally fetch in State A). getPollTally + subscribeToVotes are gated on
  // showResults so neither is called before the user votes.
  useEffect(() => {
    if (!showResults) return undefined;
    const supabase = createSupabaseBrowserClient();
    refreshTally(supabase);
    cleanupRef.current = subscribeToVotes(supabase, poll.id, () => {
      // Recompute the aggregate from rows on every event (never trust a single
      // payload as the whole tally — Pitfall 5).
      refreshTally(supabase);
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [showResults, poll.id, refreshTally]);

  const countMap = useMemo(() => {
    const m = new Map();
    for (const c of tally.counts ?? []) m.set(c.optionId, c.count);
    return m;
  }, [tally]);

  async function handleVote() {
    if (!selected || submitting) return;
    setVoteError(null);
    setSubmitting(true);
    try {
      const result = await votePollAction(poll.id, selected);
      if (!result.ok) {
        setVoteError(t("poll.voteError"));
        return;
      }
      setVotedOptionId(selected);
      setChanging(false);
      setAnnounce(`${t("poll.voteSuccess")} ${t("poll.resultsHeading")}.`);
    } catch {
      setVoteError(t("poll.voteError"));
    } finally {
      setSubmitting(false);
    }
  }

  function startChangeVote() {
    setSelected(votedOptionId);
    setChanging(true);
  }

  async function handleClose() {
    if (closing) return;
    setClosing(true);
    try {
      const result = await closePollAction(poll.id);
      if (result.ok) {
        setStatus("closed");
        setConfirmClose(false);
      } else {
        // PAR-105: a failed close used to silently no-op — the poll stayed open
        // with no feedback, so the author assumed it had closed.
        setVoteError(t("poll.closeError"));
      }
    } catch {
      setVoteError(t("poll.closeError"));
    } finally {
      setClosing(false);
    }
  }

  const statusLabel = closed ? t("poll.statusClosed") : t("poll.statusOpen");
  const subhead = showResults ? t("poll.resultsHeading") : t("poll.castHeading");

  return (
    <SurfaceCard className="p-5 sm:p-6">
      <section className="flex flex-col gap-5">
        {/* aria-live region — announced on vote, never reveals tally pre-vote. */}
        <output aria-live="polite" className="sr-only">
          {announce}
        </output>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusPill tone={closed ? "neutral" : "done"}>{statusLabel}</StatusPill>
          <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-[var(--color-neutral-900)]">
            {subhead}
          </h2>
          {isBoard && !closed ? (
            <div className="ml-auto">
              {confirmClose ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--color-neutral-400)]">
                    {t("poll.closeConfirm")}
                  </span>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={closing}
                    className={`pk-ul pk-press inline-flex items-center gap-1.5 rounded text-sm font-bold ${FOCUS_RING}`}
                    style={{ color: "var(--color-danger)" }}
                  >
                    {closing ? <Loader2 size={14} className="animate-spin" /> : t("poll.closePoll")}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  className={`pk-ul pk-press rounded text-sm font-bold ${FOCUS_RING}`}
                  style={{ color: "var(--color-danger)" }}
                >
                  {t("poll.closePoll")}
                </button>
              )}
            </div>
          ) : null}
        </div>

        <p className="break-words text-[17px] font-bold leading-relaxed tracking-[-0.01em] text-[var(--color-neutral-900)]">
          {poll.question}
        </p>

        {showResults ? (
          <ResultsView
            options={options}
            countMap={countMap}
            total={tally.total ?? 0}
            votedOptionId={votedOptionId}
          />
        ) : (
          <PreVoteView
            options={options}
            selected={selected}
            onSelect={setSelected}
            onVote={handleVote}
            submitting={submitting}
            isUpdate={hasVoted}
          />
        )}

        {voteError ? (
          <p
            role="alert"
            className="text-sm font-semibold"
            style={{ color: "var(--color-danger)" }}
          >
            {voteError}
          </p>
        ) : null}

        {/* Change vote — only when results visible, poll open, not mid-change. */}
        {showResults && !closed && hasVoted ? (
          <button
            type="button"
            onClick={startChangeVote}
            className={`pk-ul pk-press self-start rounded text-sm font-bold text-[var(--color-brand-600)] ${FOCUS_RING}`}
          >
            {t("poll.changeVote")}
          </button>
        ) : null}

        {closed && !hasVoted ? (
          <p className="text-sm text-[var(--color-neutral-400)]">{t("poll.closedNoVote")}</p>
        ) : null}
      </section>
    </SurfaceCard>
  );
}

// ---------------------------------------------------------------------------
// State A — pre-vote (NO tally in this subtree, anti-bandwagon gate)
// ---------------------------------------------------------------------------

function PreVoteView({ options, selected, onSelect, onVote, submitting, isUpdate }) {
  // PAR-001 fix: sub-component needs its own t().
  const { t } = useTranslation("polls");
  return (
    <>
      <RadioGroup value={selected ?? ""} onValueChange={onSelect} className="flex flex-col gap-2">
        {options.map((opt) => {
          const isSel = selected === opt.id;
          return (
            // biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem is the control inside this label
            <label
              key={opt.id}
              className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] border px-4 transition-colors ${
                isSel
                  ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50)]"
                  : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)] hover:bg-[var(--color-neutral-100)]"
              } focus-within:ring-2 focus-within:ring-[var(--color-brand-500)] focus-within:ring-offset-2`}
            >
              <RadioGroupItem value={opt.id} />
              <span
                className={`break-words py-2 text-[15px] ${
                  isSel
                    ? "font-bold text-[var(--color-brand-700)]"
                    : "text-[var(--color-neutral-900)]"
                }`}
              >
                {opt.label}
              </span>
            </label>
          );
        })}
      </RadioGroup>

      <button
        type="button"
        onClick={onVote}
        disabled={!selected || submitting}
        className={`pk-press pk-shine inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-600)] text-[15px] font-bold text-white transition-colors hover:bg-[var(--color-brand-700)] disabled:cursor-not-allowed disabled:bg-[var(--color-neutral-200)] disabled:text-[var(--color-neutral-400)] ${FOCUS_RING}`}
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("poll.voting")}
          </>
        ) : isUpdate ? (
          t("poll.updateVote")
        ) : (
          t("poll.voteCta")
        )}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// State B / C — results
// ---------------------------------------------------------------------------

function ResultsView({ options, countMap, total, votedOptionId }) {
  // PAR-001 fix: sub-component needs its own t().
  const { t } = useTranslation("polls");
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt) => {
        const count = countMap.get(opt.id) ?? 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        const isMine = votedOptionId === opt.id;
        const valueText = t("poll.tallyValue")
          .replace("{{percent}}", String(percent))
          .replace("{{count}}", String(count));
        const a11y = `${opt.label}: ${percent} percent, ${count} votes${isMine ? `, ${t("poll.yourVote")}` : ""}`;

        return (
          <div
            key={opt.id}
            className={`flex flex-col gap-2 rounded-[14px] border px-4 py-3 transition-colors ${
              isMine
                ? "border-[var(--color-brand-500)] bg-[var(--color-brand-50)]"
                : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-0)]"
            }`}
          >
            <span className="sr-only">{a11y}</span>
            <div className="flex items-start gap-2" aria-hidden="true">
              <span
                className={`min-w-0 flex-1 break-words text-[15px] ${
                  isMine
                    ? "font-bold text-[var(--color-brand-700)]"
                    : "font-semibold text-[var(--color-neutral-900)]"
                }`}
              >
                {opt.label}
              </span>
              {isMine ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold"
                  style={{ color: "var(--color-brand-600)" }}
                >
                  <Check size={13} strokeWidth={3} aria-hidden="true" />
                  {t("poll.yourVote")}
                </span>
              ) : null}
              <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--color-neutral-600)]">
                {valueText}
              </span>
            </div>
            {/* Tally bar — neutral.100 track + brand.500 fill that grows into place.
                The numeric data lives in the sr-only line above; the bar itself is
                decorative (aria-hidden). Width transitions on every live update. */}
            <div
              aria-hidden="true"
              className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-100)]"
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${percent}%`,
                  backgroundColor: "var(--color-brand-500)",
                  opacity: isMine ? 1 : 0.45,
                }}
              />
            </div>
          </div>
        );
      })}
      <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-neutral-400)]">
        {t("poll.totalVotes").replace("{{total}}", String(total))}
      </p>
    </div>
  );
}
