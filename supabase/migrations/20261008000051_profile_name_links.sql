-- Migration 051: let the API join "who did this" columns to profiles.
--
-- The shared api-client reads names with PostgREST embeds such as
--   complaints.select('…, reporter:reporter_id ( user_id, full_name )')
-- PostgREST can only embed through a foreign key into an exposed schema. These
-- columns only referenced auth.users (not exposed), so every such list failed
-- with PGRST200 ("Could not find a relationship …") — the web showed
-- "Couldn't load complaints", and notices, community, bookings and flat actions
-- failed the same way. society_memberships.user_id is the same story for the
-- member directory, society profile and role-transfer pages.
--
-- Fix: add a second foreign key from each column to public.profiles(user_id).
-- The existing auth.users keys stay. Every sign-up path writes the profile
-- before any membership or post, and no data changes. Names are still filtered
-- by the profiles RLS policies (same-society members only).
--
-- One link per column, so each embed resolves unambiguously.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('complaints',          'reporter_id'),
      ('complaints',          'owner_id'),
      ('complaint_responses', 'responder_id'),
      ('notifications',       'author_id'),
      ('posts',               'author_id'),
      ('post_comments',       'author_id'),
      ('moderation_events',   'actor_id'),
      ('bookings',            'requester_id'),
      ('flat_actions',        'issuer_id'),
      ('society_memberships', 'user_id')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = format('%s_%s_profile_fkey', r.tbl, r.col)
    ) then
      -- NOT VALID: the link is added without checking old rows (PostgREST
      -- embeds through it either way) and is enforced for every new row. A
      -- database with a legacy row whose user has no profile (e.g. a staff
      -- author) therefore still migrates; that one link just stays unvalidated.
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.profiles(user_id) not valid',
        r.tbl, format('%s_%s_profile_fkey', r.tbl, r.col), r.col
      );
    end if;
    begin
      execute format('alter table public.%I validate constraint %I',
                     r.tbl, format('%s_%s_profile_fkey', r.tbl, r.col));
    exception when foreign_key_violation then
      raise notice '%.% has rows without a profile — link left NOT VALID', r.tbl, r.col;
    end;
  end loop;
end $$;

-- Pick up the new relationships without restarting the API.
notify pgrst, 'reload schema';
