// PollBlock — embedded poll inside the notice detail. The anti-bandwagon centerpiece.
//
// Visual + behavior contract per 05-UI-SPEC.md Screen 4 (NOTF-08).
//
// JavaScript only — no TypeScript per CLAUDE.md.

import { closePoll, getPollTally, subscribeToVotes, voteOnPoll } from "@parisar/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, ActivityIndicator, Pressable, Text, View } from "react-native";
import { PollOptionBar } from "./PollOptionBar";

const BRAND_500 = "#12715A";
const DANGER_500 = "#c81e1e";
const BOARD_ROLES = new Set(["board_member", "co_secretary", "secretary"]);

/**
 * @param {{
 *   supabase: object,
 *   poll: { id: string, question: string, status: string },
 *   options: Array<{ id: string, label: string, position: number }>,
 *   myVote: { id: string, option_id: string } | null,
 *   role?: string,
 *   onToast?: (message: string, variant?: 'success'|'error') => void,
 * }} props
 */
export function PollBlock({ supabase, poll, options, myVote, role = "member", onToast }) {
  const { t } = useTranslation("polls");
  const isBoard = BOARD_ROLES.has(role);

  // Local poll status (Realtime/close can move it to 'closed').
  const [status, setStatus] = useState(poll?.status ?? "open");
  // The user's persisted choice (null = not voted). Drives State A vs B.
  const [votedOptionId, setVotedOptionId] = useState(myVote?.option_id ?? null);
  // Selection in State A (pre-vote / change-vote).
  const [selected, setSelected] = useState(myVote?.option_id ?? null);
  // When voted but the user tapped "Change vote", we re-enter State A.
  const [changing, setChanging] = useState(false);

  // Aggregate tally — populated only after the user votes (State B) or close (State C).
  const [tally, setTally] = useState({ counts: [], total: 0 });
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const cleanupRef = useRef(null);

  const closed = status === "closed";
  const hasVoted = !!votedOptionId;
  const showResults = closed || (hasVoted && !changing);

  // Refresh the aggregate from poll_votes rows (count-from-rows, never a counter).
  const refreshTally = useCallback(async () => {
    if (!poll?.id) return;
    try {
      const tallyRes = await getPollTally(supabase, poll.id);
      setTally(tallyRes);
    } catch (err) {
      console.warn("[PollBlock] tally refresh failed:", err?.message ?? err);
    }
  }, [supabase, poll?.id]);

  // Fetch the tally when results become visible (post-vote or closed), and subscribe
  // to live vote changes while results are showing. Clean up the channel on unmount.
  useEffect(() => {
    if (!showResults || !poll?.id) return undefined;
    refreshTally();
    cleanupRef.current = subscribeToVotes(supabase, poll.id, () => {
      // Never trust a single payload as the whole tally — recompute from rows.
      refreshTally();
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [showResults, poll?.id, supabase, refreshTally]);

  const countFor = (optionId) => tally.counts.find((c) => c.optionId === optionId)?.count ?? 0;

  async function handleVote() {
    if (voting || !selected) return;
    setVoting(true);
    try {
      await voteOnPoll(supabase, { pollId: poll.id, optionId: selected });
      // Only on RPC confirm do we reveal results (no optimistic reveal).
      setVotedOptionId(selected);
      setChanging(false);
      AccessibilityInfo.announceForAccessibility?.("Vote recorded. Results now visible.");
      onToast?.(t("poll.voteSuccess"), "success");
    } catch (err) {
      console.warn("[PollBlock] vote failed:", err?.message ?? err);
      const code = String(err?.message ?? "");
      if (code.includes("POLL_CLOSED")) {
        // Closed mid-flight — move everyone to State C.
        setStatus("closed");
        onToast?.(t("poll.voteError"), "error");
      } else {
        onToast?.(t("poll.voteError"), "error");
      }
    } finally {
      setVoting(false);
    }
  }

  async function handleClose() {
    if (closing) return;
    setClosing(true);
    try {
      await closePoll(supabase, { pollId: poll.id });
      setStatus("closed");
      setConfirmClose(false);
    } catch (err) {
      console.warn("[PollBlock] close failed:", err?.message ?? err);
      onToast?.(t("poll.voteError"), "error");
    } finally {
      setClosing(false);
    }
  }

  const subhead = !showResults && !closed ? t("poll.castHeading") : t("poll.resultsHeading");

  return (
    <View className="bg-white rounded-xl p-4 gap-4">
      {/* Header: status pill + subhead + (board) Close poll */}
      <View className="flex-row items-center gap-2">
        <StatusPill closed={closed} t={t} />
        <Text className="text-xl font-semibold text-neutral-900 flex-1">{subhead}</Text>
        {isBoard && !closed ? (
          <Pressable
            onPress={() => setConfirmClose(true)}
            accessibilityRole="button"
            accessibilityLabel={t("poll.closePoll")}
          >
            <Text className="text-sm font-semibold" style={{ color: DANGER_500 }}>
              {t("poll.closePoll")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Inline close confirm */}
      {confirmClose ? (
        <View
          className="rounded-xl border border-danger-500 p-3 gap-2"
          style={{ backgroundColor: "#fef2f2" }}
        >
          <Text className="text-sm text-neutral-900">{t("poll.closeConfirm")}</Text>
          <View className="flex-row gap-3">
            <Pressable
              onPress={handleClose}
              disabled={closing}
              accessibilityRole="button"
              accessibilityLabel={t("poll.closePoll")}
              className="h-10 px-4 rounded-lg items-center justify-center"
              style={{ backgroundColor: DANGER_500 }}
            >
              {closing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-sm font-semibold text-white">{t("poll.closePoll")}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setConfirmClose(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="h-10 px-4 rounded-lg items-center justify-center border border-neutral-200"
            >
              <Text className="text-sm font-semibold text-neutral-900">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Question */}
      <Text className="text-base text-neutral-900">{poll?.question}</Text>

      {showResults ? (
        // ---- State B (open, voted) / State C (closed) — aggregate bars ----
        <View className="gap-3">
          {(options ?? []).map((opt) => (
            <PollOptionBar
              key={opt.id}
              label={opt.label}
              count={countFor(opt.id)}
              total={tally.total}
              chosen={votedOptionId === opt.id}
            />
          ))}
          <Text className="text-sm text-neutral-400">
            {t("poll.totalVotes", { total: String(tally.total) })}
          </Text>

          {/* Change vote — only while open (State B). Closed (State C) shows no buttons. */}
          {!closed ? (
            <Pressable
              onPress={() => {
                setChanging(true);
                setSelected(votedOptionId);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("poll.changeVote")}
              className="items-start"
            >
              <Text className="text-sm font-semibold" style={{ color: BRAND_500 }}>
                {t("poll.changeVote")}
              </Text>
            </Pressable>
          ) : !hasVoted ? (
            <Text className="text-sm text-neutral-400">{t("poll.closedNoVote")}</Text>
          ) : null}
        </View>
      ) : (
        // ---- State A (open, NOT voted OR changing) — option rows, NO results ----
        <View className="gap-2">
          {options.map((opt) => {
            const isSel = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelected(opt.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={opt.label}
                className={`flex-row items-center gap-3 rounded-xl border px-3 ${
                  isSel ? "border-brand-500" : "border-neutral-200"
                }`}
                style={{ minHeight: 48, backgroundColor: isSel ? "#f5f7ff" : "#ffffff" }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: isSel ? BRAND_500 : "#6e6e6e",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSel ? (
                    <View
                      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND_500 }}
                    />
                  ) : null}
                </View>
                <Text className="text-base text-neutral-900 flex-1" numberOfLines={2}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={handleVote}
            disabled={!selected || voting}
            accessibilityRole="button"
            accessibilityLabel={changing ? t("poll.updateVote") : t("poll.voteCta")}
            accessibilityState={{ disabled: !selected || voting, busy: voting }}
            className={`h-12 w-full rounded-xl items-center justify-center mt-1 ${
              selected && !voting ? "bg-brand-500 active:bg-brand-600" : "bg-neutral-200"
            }`}
          >
            {voting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#ffffff" />
                <Text className="text-base font-semibold text-white">{t("poll.voting")}</Text>
              </View>
            ) : (
              <Text
                className={`text-base font-semibold ${selected ? "text-white" : "text-neutral-400"}`}
              >
                {changing ? t("poll.updateVote") : t("poll.voteCta")}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function StatusPill({ closed, t }) {
  if (closed) {
    return (
      <View className="rounded-full px-2 py-0.5 bg-neutral-100">
        <Text className="text-sm text-neutral-600">{t("poll.statusClosed")}</Text>
      </View>
    );
  }
  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#f5f7ff" }}>
      <Text className="text-sm" style={{ color: BRAND_500 }}>
        {t("poll.statusOpen")}
      </Text>
    </View>
  );
}
