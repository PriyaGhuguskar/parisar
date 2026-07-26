// PAR-001 regression guard (QA-AUDIT-REPORT.md).
//
// The audit's #1 finding was that the most defect-dense screens crashed on
// render (module-scope `t()`, nested sub-components with no `useTranslation`,
// and the `t("key.replace")(…)` anti-pattern) — yet CI stayed green because
// these components had ZERO render coverage. This suite renders each of them
// (and, via realistic props, their previously-crashing internal sub-components)
// and asserts they mount without throwing. If a module-scope `t()` or a missing
// hook ever comes back, one of these renders will throw and fail CI.
//
// react-i18next is mocked globally in vitest.setup.js (t() resolves English).

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- next/navigation ---------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => ({ get: () => null }),
}));

// --- supabase browser client -------------------------------------------------
function makeQuery() {
  const q = {};
  for (const m of [
    "select",
    "eq",
    "in",
    "order",
    "limit",
    "single",
    "maybeSingle",
    "insert",
    "update",
    "delete",
    "gte",
    "lte",
    "is",
    "or",
    "match",
    "range",
    "filter",
    "not",
  ]) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve) => resolve({ data: [], error: null });
  return q;
}
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    from: vi.fn(() => makeQuery()),
    rpc: vi.fn(async () => ({ data: { tally: {}, total: 0, my_option: null }, error: null })),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1" } } })) },
  }),
}));

// --- @parisar/api-client (keep enums; stub the side-effect helpers) ----------
vi.mock("@parisar/api-client", async (importOriginal) => {
  const actual = await importOriginal();
  const noopSub = () => () => {};
  return {
    ...actual,
    subscribeToFeed: vi.fn(noopSub),
    subscribeToVotes: vi.fn(noopSub),
    subscribeToBookings: vi.fn(noopSub),
    subscribeToNotices: vi.fn(noopSub),
    subscribeToPostComments: vi.fn(noopSub),
    subscribeToModerationQueue: vi.fn(noopSub),
    subscribeFlatActions: vi.fn(noopSub),
    listModerationQueue: vi.fn(async () => ({ queue: [], audit: [] })),
    createPost: vi.fn(async () => ({})),
    getPollTally: vi.fn(async () => ({ counts: [], total: 0, myOption: null })),
    uploadFinePdfWeb: vi.fn(async () => ({})),
    uploadNoticeAttachmentWeb: vi.fn(async () => ({})),
    revealPhone: vi.fn(async () => "9812345678"),
  };
});

// --- Zustand join-state store (ProfileForm) ----------------------------------
vi.mock("@/lib/join-state", () => ({
  useJoinState: () => ({
    code: "ABCD1234",
    society: { name: "Green Meadows" },
    structure: {
      wings: [{ id: "w1", name: "A" }],
      flats: [{ id: "f1", wing_name: "A", number: "101" }],
    },
    joinResult: null,
    setJoinResult: vi.fn(),
  }),
}));

// --- server actions (Next "use server" modules can't run in JSDOM) -----------
vi.mock("@/app/actions/notifications", () => ({
  votePollAction: vi.fn(),
  closePollAction: vi.fn(),
  postNoticeAction: vi.fn(),
}));
vi.mock("@/app/actions/bookings", () => ({
  requestBookingAction: vi.fn(),
  approveBookingAction: vi.fn(),
  rejectBookingAction: vi.fn(),
}));
vi.mock("@/app/actions/preferences", () => ({ updatePreferenceAction: vi.fn() }));
vi.mock("@/app/(protected)/community/actions", () => ({
  reportContentAction: vi.fn(),
  deletePostAction: vi.fn(),
  restoreContentAction: vi.fn(),
  takedownContentAction: vi.fn(),
}));
vi.mock("@/app/(protected)/flat-actions/actions", () => ({ issueFlatActionAction: vi.fn() }));

import { BookingForm } from "@/components/bookings/BookingForm";
import { BookingListClient } from "@/components/bookings/BookingListClient";
// --- components under test ---------------------------------------------------
import { AuditLogRow } from "@/components/community/AuditLogRow";
import { CommunityFeedClient } from "@/components/community/CommunityFeedClient";
import { ModerationCard } from "@/components/community/ModerationCard";
import { ModerationClient } from "@/components/community/ModerationClient";
import { PostComposer } from "@/components/community/PostComposer";
import { PostDetailClient } from "@/components/community/PostDetailClient";
import { PostTypeChip } from "@/components/community/PostTypeChip";
import { ReportReasonSheet } from "@/components/community/ReportReasonSheet";
import { FineStatusBadge } from "@/components/flat-actions/FineStatusBadge";
import { FlatActionKindBadge } from "@/components/flat-actions/FlatActionKindBadge";
import { FlatActionsClient } from "@/components/flat-actions/FlatActionsClient";
import { FlatPicker } from "@/components/flat-actions/FlatPicker";
import { IssueActionForm } from "@/components/flat-actions/IssueActionForm";
import ProfileForm from "@/components/join/ProfileForm";
import { NoticeListClient } from "@/components/notices/NoticeListClient";
import { PollBlock } from "@/components/polls/PollBlock";
import { PreferencesClient } from "@/components/settings/PreferencesClient";

// --- fixtures ----------------------------------------------------------------
const FLAT = { number: "101", wing: { name: "A" }, wings: { name: "A" } };
const AT = "2026-06-18T14:32:00+00:00";
const post = {
  id: "p1",
  kind: "general",
  body: "hello",
  author: { full_name: "Asha Roy" },
  author_flat: FLAT,
  created_at: AT,
  comment_count: 2,
};
const notice = {
  id: "n1",
  title: "Water cut",
  body: "10am-2pm",
  author: { full_name: "Asha Roy" },
  author_flat: FLAT,
  created_at: AT,
  poll: null,
  has_attachment: false,
};
const booking = {
  id: "b1",
  status: "pending",
  amenity: { name: "Pool" },
  requester: { full_name: "Asha" },
  requester_flat: FLAT,
  time_range: '["2026-06-18T18:00:00+00","2026-06-18T20:00:00+00")',
};
const options = [
  { id: "o1", label: "Yes" },
  { id: "o2", label: "No" },
];
const comment = {
  id: "c1",
  body: "nice",
  author: { full_name: "Ravi Nair" },
  author_flat: FLAT,
  created_at: AT,
};
const modItem = {
  id: "mi1",
  targetKind: "post",
  author: { full_name: "Ravi Nair" },
  author_flat: FLAT,
  reportCount: 1,
  reasons: ["spam"],
};
const flatAction = {
  id: "fa1",
  kind: "fine",
  body: "late fee",
  amount: 500,
  due_date: "2026-07-01",
  status: "outstanding",
  flat: FLAT,
  issued_by: { full_name: "Secretary" },
  issuer_flat: FLAT,
  created_at: AT,
};

// Assert a component renders without throwing (the PAR-001 failure mode).
function smoke(ui) {
  expect(() => render(ui)).not.toThrow();
}

describe("PAR-001 render smoke — previously-crashing components mount cleanly", () => {
  beforeEach(() => vi.clearAllMocks());

  it("badges/chips (module-scope t() tables)", () => {
    smoke(<FlatActionKindBadge kind="fine" />);
    smoke(<FineStatusBadge fineStatus="outstanding" dueDate="2026-06-30" />);
    smoke(<PostTypeChip kind="sell" />);
    smoke(
      <FlatPicker flats={[{ id: "f1", number: "101", wing: { name: "A" } }]} onSelect={() => {}} />,
    );
  });

  it("AuditLogRow (module-scope EVENT_LABEL + .replace by-lines)", () => {
    smoke(
      <AuditLogRow
        event={{
          event_kind: "report",
          actor: { full_name: "Asha" },
          actor_flat: FLAT,
          target_kind: "post",
          reason: "spam",
          created_at: AT,
        }}
      />,
    );
  });

  it("ReportReasonSheet (module-scope REASONS + reportTitle.replace)", () => {
    smoke(<ReportReasonSheet open onOpenChange={() => {}} targetKind="post" targetId="t1" />);
  });

  it("ModerationCard (postedBy/reportCount/reportedFor .replace)", () => {
    smoke(
      <ModerationCard
        item={{
          id: "m1",
          targetKind: "post",
          author: { full_name: "Asha" },
          author_flat: FLAT,
          reportCount: 2,
          reasons: ["spam", "abuse"],
        }}
        onResolved={() => {}}
      />,
    );
  });

  it("CommunityFeedClient → PostCard (nested hook + postedBy/commentCount .replace)", () => {
    smoke(<CommunityFeedClient initialPosts={[post]} societyId="s1" role="member" userId="u1" />);
    smoke(<CommunityFeedClient initialPosts={[]} societyId="s1" role="member" userId="u1" />); // EmptyState
    smoke(
      <CommunityFeedClient
        initialPosts={[]}
        societyId="s1"
        role="member"
        userId="u1"
        loadError="x"
      />,
    ); // ErrorState
  });

  it("PostComposer (module-scope TYPES)", () => {
    smoke(<PostComposer societyId="s1" />);
  });

  it("PollBlock → PreVoteView (unvoted) AND ResultsView (voted + totalVotes.replace)", () => {
    smoke(
      <PollBlock
        poll={{ id: "p1", status: "open" }}
        options={options}
        myVote={null}
        role="member"
      />,
    );
    smoke(
      <PollBlock
        poll={{ id: "p1", status: "open" }}
        options={options}
        myVote={{ option_id: "o1" }}
        role="member"
      />,
    );
  });

  it("BookingListClient → BookingStatusBadge (nested hook)", () => {
    smoke(<BookingListClient initialBookings={[booking]} societyId="s1" role="member" />);
    smoke(<BookingListClient initialBookings={[booking]} societyId="s1" role="secretary" />);
  });

  it("BookingForm (module-scope ERROR_COPY + hoursHint + timeHelper.replace)", () => {
    smoke(
      <BookingForm
        amenities={[{ id: "a1", name: "Pool", open_time: "06:00:00", close_time: "22:00:00" }]}
        hasAmenities
      />,
    );
  });

  it("IssueActionForm (module-scope KINDS)", () => {
    smoke(
      <IssueActionForm societyId="s1" flats={[{ id: "f1", number: "101", wing: { name: "A" } }]} />,
    );
  });

  it("NoticeListClient → NoticeCard/AttachmentPill/EmptyState/ErrorState (nested hooks)", () => {
    smoke(
      <NoticeListClient initialNotices={[notice]} societyId="s1" role="member" pollsOnly={false} />,
    );
    smoke(
      <NoticeListClient initialNotices={[]} societyId="s1" role="secretary" pollsOnly={false} />,
    );
    smoke(
      <NoticeListClient
        initialNotices={[]}
        societyId="s1"
        role="member"
        pollsOnly={false}
        loadError="x"
      />,
    );
  });

  it("PreferencesClient (capValue.replace + SavedFlash nested hook)", () => {
    smoke(<PreferencesClient societyId="s1" initialPrefs={null} />);
  });

  it("PostDetailClient → CommentItem (nested hook, found by this suite)", () => {
    smoke(<PostDetailClient post={post} initialComments={[comment]} userId="u1" />);
  });

  it("ModerationClient → ModerationCard + ReviewEmpty (nested hook)", () => {
    smoke(<ModerationClient initialQueue={[modItem]} initialAudit={[]} societyId="s1" />);
    smoke(<ModerationClient initialQueue={[]} initialAudit={[]} societyId="s1" />); // ReviewEmpty
  });

  it("FlatActionsClient → FlatActionCard/EmptyState/ErrorState (nested hooks)", () => {
    smoke(
      <FlatActionsClient initialActions={[flatAction]} societyId="s1" role="member" flats={[]} />,
    );
    smoke(<FlatActionsClient initialActions={[]} societyId="s1" role="secretary" flats={[]} />);
    smoke(
      <FlatActionsClient
        initialActions={[]}
        societyId="s1"
        role="member"
        flats={[]}
        loadError="x"
      />,
    );
  });

  it("ProfileForm (join screen — main component was missing its hook)", () => {
    smoke(
      <ProfileForm
        userProfile={{ full_name: "Ravi Nair", phone: "+919000000004", userId: "u1" }}
      />,
    );
  });
});
