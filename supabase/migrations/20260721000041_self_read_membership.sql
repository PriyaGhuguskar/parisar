-- ============================================================================
-- Let a user always read their OWN membership rows.
-- ----------------------------------------------------------------------------
-- society_memberships only had tenant_all_memberships (society_id =
-- current_society_id()), so reading your own membership required the JWT to
-- already carry the society_id claim. On a chairman's FIRST login the claim is
-- minted by refreshSession() and then races the very next server render — the
-- /setup/structure guard reads the just-created membership, gets nothing while
-- the claim propagates, and bounces the chairman to /dashboard instead of setup.
--
-- A self-scoped read (user_id = auth.uid()) exposes only the caller's own rows —
-- no cross-tenant leak — and makes every "resolve my society from my membership"
-- path (dashboard, profile, setup) robust regardless of claim timing.
-- ============================================================================

create policy self_read_membership on public.society_memberships
  for select to authenticated
  using (user_id = auth.uid());
