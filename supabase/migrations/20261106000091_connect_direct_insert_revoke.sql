-- ============================================================================
-- Migration 091: close the direct insert on society_enrollment_requests.
--
-- 060 kept the anon/authenticated column INSERT grant (014/017) while the old
-- EnrollForm wrote to the table directly. That form is gone; /connect uses
-- submit_connect_request, which validates every field and limits per phone and
-- per address. The direct path skipped both, so anyone could fill the lead
-- queue (and the global throttle_public_lead budget) with raw rows.
-- ============================================================================

drop policy if exists society_enrollment_anon_insert on public.society_enrollment_requests;
revoke insert on public.society_enrollment_requests from anon, authenticated;
revoke insert (society_name, contact_name, phone, preferred_slot, preferred_at, call_now)
  on public.society_enrollment_requests from anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.society_enrollment_requests', 'INSERT')
     or has_column_privilege('anon', 'public.society_enrollment_requests', 'phone', 'INSERT')
     or has_column_privilege('authenticated', 'public.society_enrollment_requests', 'phone', 'INSERT') then
    raise exception '091 self-check: society_enrollment_requests still takes client inserts';
  end if;
end
$$;
