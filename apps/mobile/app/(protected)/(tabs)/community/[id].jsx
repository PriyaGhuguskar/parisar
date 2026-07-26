// /(protected)/(tabs)/community/[id] — Post detail + comments (COMM-04).
//
// Per 06-UI-SPEC.md Screen 6:
//   - Section 1: full PostCard (type chip, OwnerChip, full body, PhotoGrid) with Report (post).
//   - Section 2: Comments (CommentItem list, oldest-first) — each comment Reportable / deletable.
//   - Section 3: sticky comment composer (addComment, no optimistic UI).
//   - Report via ReportReasonSheet on the post + each comment. On confirm → reportContent →
//     swap that item to a HiddenPendingBanner for the reporter (the ONLY optimistic state, D-03).
//   - Realtime on post_comments for this post.
//
// NO client-side hide logic: the comment list renders the RLS query result as-is; a reported
// comment disappears for OTHERS via server auto-hide. The reporter's own view shows the
// inline HiddenPendingBanner swap.
//
// JavaScript only — no TypeScript per CLAUDE.md.

import {
  addComment,
  deleteComment,
  deletePost,
  getPost,
  listComments,
  reportContent,
  subscribeToPostComments,
} from "@parisar/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { CommentItem } from "../../../../components/community/CommentItem";
import { HiddenPendingBanner } from "../../../../components/community/HiddenPendingBanner";
import { PostCard } from "../../../../components/community/PostCard";
import { ReportReasonSheet } from "../../../../components/community/ReportReasonSheet";
import { useAuthStore } from "../../../../lib/auth-store";
import { getSupabase } from "../../../../lib/supabase";

const COMMENT_MAX = 1000;

export default function PostDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation("community");
  const { id: postId } = useLocalSearchParams();
  const session = useAuthStore((s) => s.session);

  const userId = session?.user?.id ?? null;

  const [post, setPost] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Comment composer
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  // Report flow — { targetKind: 'post'|'comment', targetId } while the sheet is open.
  const [reportTarget, setReportTarget] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState(null);
  // Items the reporter has optimistically hidden (D-03): keyed by id.
  const [reportedIds, setReportedIds] = useState(new Set());

  const cleanupRef = useRef(null);

  const load = useCallback(async () => {
    if (!postId) return;
    setError(null);
    try {
      const supabase = getSupabase();
      const { post: p, attachments: a } = await getPost(supabase, postId);
      const c = await listComments(supabase, postId);
      setPost(p);
      setAttachments(a);
      setComments(c);
    } catch (err) {
      console.warn("[community/[id]] load failed:", err?.message ?? err);
      setError(err?.message ?? "load_failed");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — new comments append; updates/absence reflect server auto-hide on re-load.
  useEffect(() => {
    if (!postId) return undefined;
    const supabase = getSupabase();
    cleanupRef.current = subscribeToPostComments(supabase, postId, {
      onInsert: (row) => {
        setComments((prev) => {
          if (prev.some((c) => c.id === row.id)) return prev;
          return [...prev, row];
        });
      },
      onUpdate: () => load(),
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [postId, load]);

  async function handleSendComment() {
    const body = commentText.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const supabase = getSupabase();
      await addComment(supabase, { postId, body });
      setCommentText("");
      // No optimistic UI — the comment arrives via Realtime INSERT.
    } catch (err) {
      console.warn("[community/[id]] add comment failed:", err?.message ?? err);
    } finally {
      setSending(false);
    }
  }

  function openReport(targetKind, targetId) {
    setReportError(null);
    setReportTarget({ targetKind, targetId });
  }

  async function handleConfirmReport({ reason, note }) {
    if (!reportTarget) return;
    setReporting(true);
    setReportError(null);
    try {
      const supabase = getSupabase();
      await reportContent(supabase, {
        targetKind: reportTarget.targetKind,
        targetId: reportTarget.targetId,
        reason,
        note,
      });
      // Optimistic swap for the reporter only (D-03) — mark this id hidden-pending.
      setReportedIds((prev) => {
        const next = new Set(prev);
        next.add(reportTarget.targetId);
        return next;
      });
      setReportTarget(null);
    } catch (err) {
      console.warn("[community/[id]] report failed:", err?.message ?? err);
      setReportError(t("community.reportError"));
    } finally {
      setReporting(false);
    }
  }

  // PAR-103: both deletes were console.warn-only — the post/comment stayed on
  // screen with zero feedback, so the user assumed the delete had worked. Surface
  // it via Alert (the established pattern in this app). NOT setError(), which
  // would replace the whole screen with the full-page error state.
  async function handleDeletePost() {
    try {
      await deletePost(getSupabase(), postId);
      router.back();
    } catch (err) {
      console.warn("[community/[id]] delete post failed:", err?.message ?? err);
      Alert.alert(t("community.deleteError"));
    }
  }

  async function handleDeleteComment(comment) {
    try {
      await deleteComment(getSupabase(), comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      console.warn("[community/[id]] delete comment failed:", err?.message ?? err);
      Alert.alert(t("community.deleteError"));
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center">
        <ActivityIndicator size="large" color="#12715A" />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View className="flex-1 bg-neutral-50 items-center justify-center px-8 gap-3">
        <Text className="text-xl font-semibold text-neutral-900 text-center">
          {t("community.loadError")}
        </Text>
        <Pressable
          onPress={load}
          className="h-10 px-4 rounded-lg border border-neutral-200 items-center justify-center mt-2"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-neutral-900">Try again</Text>
        </Pressable>
      </View>
    );
  }

  const postReported = reportedIds.has(post.id);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-50"
    >
      {/* Header */}
      <View className="px-4 pt-12 pb-3 bg-white border-b border-neutral-100 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="p-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-base text-brand-500">{"←"}</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-neutral-900 flex-1">
          {t("community.detailTitle")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {/* Section 1 — full post (or the reporter's optimistic hidden banner) */}
        {postReported ? (
          <HiddenPendingBanner />
        ) : (
          <PostCard
            post={post}
            currentUserId={userId}
            supabase={getSupabase()}
            attachments={attachments}
            numberOfBodyLines={0}
            onReport={() => openReport("post", post.id)}
            onDelete={handleDeletePost}
          />
        )}

        {/* Section 2 — comments */}
        <View className="gap-2">
          <Text className="text-xl font-semibold text-neutral-900">
            {t("community.commentsHeading")}
          </Text>
          {comments.length === 0 ? (
            <View className="bg-white rounded-xl p-4">
              <Text className="text-sm text-neutral-400 text-center">
                {t("community.commentsEmpty")}
              </Text>
            </View>
          ) : (
            comments.map((c) =>
              reportedIds.has(c.id) ? (
                <HiddenPendingBanner key={c.id} />
              ) : (
                <CommentItem
                  key={c.id}
                  comment={c}
                  currentUserId={userId}
                  onReport={() => openReport("comment", c.id)}
                  onDelete={handleDeleteComment}
                />
              ),
            )
          )}
        </View>
      </ScrollView>

      {/* Section 3 — sticky comment composer */}
      <View className="flex-row items-end gap-2 px-4 py-3 bg-white border-t border-neutral-100">
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder={t("community.commentPlaceholder")}
          placeholderTextColor="#6e6e6e"
          multiline
          maxLength={COMMENT_MAX}
          className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900"
          style={{ minHeight: 44, maxHeight: 120 }}
          accessibilityLabel={t("community.commentPlaceholder")}
        />
        <Pressable
          onPress={handleSendComment}
          disabled={!commentText.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel={t("community.commentSend")}
          accessibilityState={{ disabled: !commentText.trim() || sending, busy: sending }}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: commentText.trim() && !sending ? "#12715A" : "#e5e5e5",
          }}
        >
          {sending ? <ActivityIndicator color="#ffffff" /> : <Send size={20} color="#ffffff" />}
        </Pressable>
      </View>

      {/* Report sheet (shared for post + comment) */}
      <ReportReasonSheet
        visible={!!reportTarget}
        targetKind={reportTarget?.targetKind ?? "post"}
        submitting={reporting}
        error={reportError}
        onClose={() => setReportTarget(null)}
        onConfirm={handleConfirmReport}
      />
    </KeyboardAvoidingView>
  );
}
