# Parisar

## What This Is

Parisar is a society management platform — a mobile app (iOS/Android) and companion website — that lets Indian residential societies run their day-to-day operations: complaints, notifications/polls, amenity bookings, and flat-level actions (warnings, fines, notices). Two roles drive the system: **Secretary** (sets up the society, takes flat actions, posts notices) and **Member** (joins via society code, files complaints, books amenities, votes in polls). Board Members are members with extra response powers.

## Core Value

A resident can file a complaint and a board member can resolve it within the app — without WhatsApp groups, paper notices, or lost messages — and the entire society sees a clear, attributed status trail ("Posted by Rahul (B-203)", "Approved by Amit (A-102)").

If everything else fails, this loop must work: **Member → Complaint → Board Member responds → Status updates → Member notified.**

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Authentication & Roles**
- [ ] User logs in with mobile + OTP (existing user → dashboard, new user → registration)
- [ ] User selects role on first signup: Secretary or Member
- [ ] Secretary creates society (name, address, secretary mobile, co-secretary mobile)
- [ ] System auto-generates a unique Society Code on society creation
- [ ] Secretary configures society structure: wings (A, B, C…) and flats (A-101, A-102…)
- [ ] Secretary adds board members (name, flat, mobile)
- [ ] Secretary selects amenities (Swimming Pool, Temple, Kids Area, Clubhouse, custom)
- [ ] Secretary appears in the board list (role visibility rule)
- [ ] Co-Secretary has the same powers as Secretary (full admin)
- [ ] Member joins existing society via Society Code (auto-join)
- [ ] System flags duplicate flat claims to the Secretary for review
- [ ] Member fills profile: owner/tenant, name, mobile, wing+flat, family/bachelor, emergency contact
- [ ] Member optionally adds family members (name, mobile)

**Complaints**
- [ ] Member files a complaint: type (Society / Member issue), description, optional photo
- [ ] Complaint is visible to Secretary + all Board Members
- [ ] Board members tap predefined responses: "Checking" / "Will resolve soon" / "Resolved" / "Need more info"
- [ ] First responder becomes the complaint owner; others see read-only
- [ ] Status updates push-notify the original member

**Notifications & Polls**
- [ ] Secretary or Board Member posts a notification (title, message, optional PDF/image attachment)
- [ ] Notification can include a poll (question + 2–4 options)
- [ ] Members read notifications and vote in polls
- [ ] Each notification displays sender name and flat ("Posted by Rahul (B-203)")

**Community Feed**
- [ ] Member creates a community post (sell item / ask for help / general), with optional photos
- [ ] Posts visible to all members of the society

**Amenity Booking**
- [ ] Member submits booking request: amenity, date, time, purpose
- [ ] Request is sent to all board members
- [ ] Any board member can Accept/Reject; first approval locks the booking
- [ ] Approved booking displays approver name + flat

**Flat-Level Actions (Secretary/Co-Secretary)**
- [ ] Secretary selects a flat and issues an action: Warning (reason), Fine (amount/reason/due date — recorded only, no payment), or Notify (message)
- [ ] Action stored against the flat and notification pushed to flat residents
- [ ] Member views warnings, fines, and messages received against their flat

**Dashboards**
- [ ] Secretary Dashboard: new complaints, pending bookings, recent notifications, recent flat actions
- [ ] Member Dashboard: my complaints, notifications, my bookings, community feed

**Cross-Cutting**
- [ ] Push notifications via FCM (Expo Notifications) for status changes, new posts, polls, fines
- [ ] App UI in English, Hindi, and Marathi (i18n from day one)
- [ ] Companion responsive website mirrors core flows (login, complaints, notifications, bookings, dashboards)

### Out of Scope

- **Payments / fine collection** — User explicit. Fines are recorded with amount + due date only; no online collection, gateway, or settlement in v1.
- **Maintenance bills / dues ledger** — Even read-only "who paid" views excluded for v1; can be added later.
- **Vendor / staff directory** — Plumber, electrician, watchman contacts not in v1.
- **Visitor / gate management (QR check-in)** — Often a separate product; defer to a later milestone.
- **Document vault** — Beyond a single attachment per notification; bylaws/AGM minutes archive is v2+.
- **Cross-society features** — Each society is isolated; no inter-society messaging or admin tooling.

## Context

- **Audience:** Indian residential societies (apartments / housing complexes). Indian society terminology is core: *wing*, *flat*, *secretary*, *co-secretary*, *board member*, *amenity*.
- **Replaces:** WhatsApp groups + paper notice boards + ad-hoc spreadsheet tracking that most Indian societies rely on today. The bar to beat is a WhatsApp group — clarity, attribution, and a status trail are the differentiators.
- **Onboarding model:** Secretary signs up first, configures the society structure, then shares the Society Code with members who self-onboard. No central admin or marketplace — each society is an island.
- **Tone:** Trust + clarity. Every action is attributed by name and flat to discourage abuse and create accountability.
- **Realtime feel matters:** Complaint status, booking approvals, and polls all need to feel live across devices. Realtime updates (Supabase Realtime / WebSockets) are not optional flair — they are the perceived-quality bar.

## Constraints

- **Tech stack — Web:** Next.js (App Router) for the companion website.
- **Tech stack — Mobile:** React Native + Expo for iOS/Android.
- **Tech stack — Backend:** Supabase (Postgres + Auth + Realtime + Storage). Single source of truth for both clients.
- **OTP provider:** Decision deferred. Auth must be wrapped in a swappable adapter so that MSG91 / Twilio / Firebase can be plugged in later. Dev environment uses a stub OTP (e.g., `123456`) until provider is chosen.
- **Push:** FCM via Expo Notifications (mobile). Web uses in-app + browser push where supported.
- **i18n:** English, Hindi, Marathi from v1. All user-facing strings localized; no hard-coded copy.
- **Repository layout:** Two codebases (Next.js web and Expo mobile) sharing a common types/API package — pnpm or Turbo monorepo recommended.
- **Compliance:** OTP/SMS sent in India must be DLT-compliant once a provider is chosen. Plan for this in the auth phase.
- **No payments:** Fines are recorded only — no payment gateway, no settlement, no PCI scope.
- **Data isolation:** Strict row-level security per society — a member must never see data from another society.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two codebases (Next.js web + Expo mobile) over single-codebase RN-web | User preference; better web polish, separate release cadence | — Pending |
| Supabase as backend | Auth + Postgres + Realtime + Storage in one service; fast for a 2-person team | — Pending |
| OTP provider deferred; stub in dev | Keeps options open; MSG91/Twilio decision can be made closer to launch | — Pending |
| i18n (en/hi/mr) from v1 | Indian society users are multilingual; retrofitting i18n is painful | — Pending |
| Member auto-join via society code, with duplicate-flat alerts | Lower friction than secretary-approves-each, safer than blind auto-join | — Pending |
| Co-Secretary = full Secretary powers | Realistic backup admin; spec listed both with no distinction | — Pending |
| Attachments enabled on Complaints, Community posts, Notifications | Photo evidence + sale listings + AGM-minute PDFs are core use cases | — Pending |
| No payments in v1 | User explicit; fines recorded as text/amount/due-date only | — Pending |
| First-responder ownership for complaints | Spec rule; prevents conflicting responses, creates accountability | — Pending |
| First-approval lock for amenity bookings | Spec rule; first board member to approve locks the slot | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-29 after initialization*
