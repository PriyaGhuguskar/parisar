-- PAR-004 (corrective) — the previous column-level REVOKE was overridden by the
-- table-level SELECT grant `authenticated` already holds, so `phone` was still
-- readable. Postgres resolves has_column_privilege to true if EITHER the table or
-- the column privilege is present. To truly restrict one column we must drop the
-- table-level SELECT and grant SELECT per-column for every column EXCEPT phone.
--
-- profiles columns: user_id, full_name, phone, created_at, signup_intent.
-- reveal_phone() + remove_member() are SECURITY DEFINER (run as the function owner)
-- so they still read phone. RLS row policies are unchanged (orthogonal to grants).

revoke select on public.profiles from authenticated;
grant  select (user_id, full_name, created_at, signup_intent)
  on public.profiles to authenticated;

-- anon defense-in-depth (RLS already blocks anon rows — it has no society claim —
-- but keep the column grant consistent so a future policy change can't leak phone).
revoke select on public.profiles from anon;
grant  select (user_id, full_name, created_at, signup_intent)
  on public.profiles to anon;
