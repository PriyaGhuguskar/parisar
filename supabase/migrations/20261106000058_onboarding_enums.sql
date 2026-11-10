-- ============================================================================
-- Migration 058: enum values for the society onboarding work.
--
-- Alone in this file on purpose: Postgres cannot use a value added by
-- ALTER TYPE ... ADD VALUE inside the transaction that added it, and later
-- migrations build indexes and defaults on these values.
--
-- enrollment_status lifecycle (see docs/onboarding/API.md):
--   new -> call_scheduled -> contacted -> registered
--            \-> rescheduled -/    \-> rejected
--   'approved' stays as the legacy spelling of 'registered' (admin_create_society
--   still writes it); every new read path reports it as 'registered'.
--
-- staff_category gains the brief's roles. Staff Role is its own field and grants
-- no permissions.
-- ============================================================================
alter type public.enrollment_status add value if not exists 'call_scheduled';
alter type public.enrollment_status add value if not exists 'rescheduled';
alter type public.enrollment_status add value if not exists 'registered';

alter type public.staff_category add value if not exists 'security';
alter type public.staff_category add value if not exists 'cleaner';
alter type public.staff_category add value if not exists 'maintenance_staff';
