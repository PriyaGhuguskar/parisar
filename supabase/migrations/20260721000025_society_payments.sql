-- ============================================================================
-- Manual payment ledger
-- ----------------------------------------------------------------------------
-- society_billing (migration …23) holds the CURRENT state — plan, amount, when
-- it is next due. It cannot answer "what has this society actually paid us", and
-- overwriting last_paid_on every time loses the history.
--
-- This is the ledger: one row per payment received, entered by hand. No gateway,
-- no reconciliation — staff record what landed in the society's own bank/UPI/
-- cash, the same way a treasurer keeps a book. It is the source of truth for
-- last_paid_on, which is now DERIVED from the newest payment rather than typed.
--
-- Deleting a payment is allowed because these are hand-entered and typos happen,
-- but every insert AND delete is audited — a money record that can be silently
-- changed is worse than none.
-- ============================================================================

do $$ begin
  create type public.payment_method as enum ('cash','upi','bank_transfer','cheque','card','other');
exception when duplicate_object then null; end $$;

create table if not exists public.society_payments (
  id           uuid primary key default gen_random_uuid(),
  society_id   uuid not null references public.societies(id) on delete cascade,
  amount       integer not null,               -- whole rupees
  paid_on      date not null,
  method       public.payment_method not null default 'upi',
  reference    text,                            -- UPI ref / cheque no / txn id
  note         text,
  recorded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint payment_amount_positive check (amount > 0),
  constraint payment_not_future      check (paid_on <= current_date),
  constraint payment_reference_len   check (reference is null or char_length(reference) <= 120),
  constraint payment_note_len        check (note is null or char_length(note) <= 500)
);

create index if not exists society_payments_society_date
  on public.society_payments (society_id, paid_on desc);

alter table public.society_payments enable row level security;
-- Staff-only. Read/write happens through the admin RPCs below; a society does
-- not read its own Parisar-subscription payment history from inside the app.
revoke all on public.society_payments from anon, authenticated;

comment on table public.society_payments is
  'Hand-entered ledger of subscription payments received from a society. Not a gateway — a record staff keep. last_paid_on on society_billing is derived from this.';

-- ---------------------------------------------------------------------------
-- Keep society_billing.last_paid_on in step with the newest payment, so the
-- billing snapshot and the ledger can never disagree. Runs on insert and delete.
-- ---------------------------------------------------------------------------
create or replace function public.sync_last_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_society uuid := coalesce(new.society_id, old.society_id);
  v_latest  date;
begin
  select max(paid_on) into v_latest from public.society_payments where society_id = v_society;
  update public.society_billing set last_paid_on = v_latest, updated_at = now()
   where society_id = v_society;
  return null;
end;
$$;

drop trigger if exists society_payments_sync on public.society_payments;
create trigger society_payments_sync
  after insert or delete on public.society_payments
  for each row execute function public.sync_last_paid();

-- ---------------------------------------------------------------------------
-- Record a payment.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_payment(
  p_society_id uuid,
  p_amount     integer,
  p_paid_on    date,
  p_method     public.payment_method,
  p_reference  text default null,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_admin uuid := auth.uid(); v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_paid_on is null or p_paid_on > current_date then raise exception 'INVALID_DATE'; end if;

  insert into public.society_payments (society_id, amount, paid_on, method, reference, note, recorded_by)
  values (p_society_id, p_amount, p_paid_on, p_method,
          nullif(trim(coalesce(p_reference,'')), ''), nullif(trim(coalesce(p_note,'')), ''), v_admin)
  returning id into v_id;

  -- Ensure a billing row exists so a first payment is not orphaned.
  insert into public.society_billing (society_id) values (p_society_id)
    on conflict (society_id) do nothing;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (p_society_id, v_admin, 'payment.recorded', 'society_payments', v_id,
          jsonb_build_object('amount', p_amount, 'paid_on', p_paid_on, 'method', p_method));
  return v_id;
end;
$$;

grant execute on function public.admin_record_payment(uuid, integer, date, public.payment_method, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Delete a mistaken entry. Audited — this is a money record.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_admin uuid := auth.uid(); v_row public.society_payments;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select * into v_row from public.society_payments where id = p_payment_id;
  if v_row.id is null then raise exception 'PAYMENT_NOT_FOUND'; end if;

  delete from public.society_payments where id = p_payment_id;

  insert into public.audit_log (society_id, actor_id, action, target_table, target_id, payload)
  values (v_row.society_id, v_admin, 'payment.deleted', 'society_payments', p_payment_id,
          jsonb_build_object('amount', v_row.amount, 'paid_on', v_row.paid_on, 'method', v_row.method));
end;
$$;

grant execute on function public.admin_delete_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Surface payments + a running total in the society detail.
-- ---------------------------------------------------------------------------
create or replace function public.admin_society_detail(p_society_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'NOT_PLATFORM_ADMIN'; end if;

  select jsonb_build_object(
    'society', (
      select jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address,
        'address_line', s.address_line, 'city', s.city, 'landmark', s.landmark,
        'state', s.state, 'pincode', s.pincode,
        'secretary_phone', s.secretary_phone, 'created_at', s.created_at,
        'code', (select c.code from public.society_codes c
                  where c.society_id = s.id and c.revoked_at is null limit 1),
        'member_count', (select count(*) from public.society_memberships m
                          where m.society_id = s.id and m.status = 'active'),
        'pending_count', (select count(*) from public.society_memberships m
                           where m.society_id = s.id and m.status = 'pending_review')
      )
      from public.societies s where s.id = p_society_id
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', f.key, 'name', f.name, 'description', f.description,
        'list_price', f.price_monthly, 'price_override', sf.price_override,
        'price', case when f.is_core then 0 else coalesce(sf.price_override, f.price_monthly) end,
        'is_core', f.is_core, 'enabled', coalesce(sf.enabled, f.is_core)
      ) order by f.sort_order), '[]'::jsonb)
      from public.platform_features f
      left join public.society_features sf on sf.feature_key = f.key and sf.society_id = p_society_id
    ),
    'billing', (select to_jsonb(b) from public.society_billing b where b.society_id = p_society_id),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'paid_on', p.paid_on,
        'method', p.method, 'reference', p.reference, 'note', p.note
      ) order by p.paid_on desc, p.created_at desc), '[]'::jsonb)
      from public.society_payments p where p.society_id = p_society_id
    ),
    'total_collected', (
      select coalesce(sum(amount), 0) from public.society_payments where society_id = p_society_id
    ),
    'notes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at
      ) order by n.created_at desc), '[]'::jsonb)
      from public.society_notes n where n.society_id = p_society_id
    )
  ) into v;

  if v->'society' is null or v->'society' = 'null'::jsonb then
    raise exception 'SOCIETY_NOT_FOUND';
  end if;
  return v;
end;
$$;

grant execute on function public.admin_society_detail(uuid) to authenticated;
