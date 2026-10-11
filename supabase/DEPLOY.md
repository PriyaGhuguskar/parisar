# Deploying Supabase (production checklist)

`supabase/config.toml` is a **local development** file. It holds settings that
would let anyone sign in to a real project, and most `[auth]` values in it are
never pushed to a hosted project anyway. Do every step below, in order, first on
a **staging** project and only then on production.

## 0. Before you start

- [ ] A staging Supabase project exists (same Postgres major version as `config.toml`: 17).
- [ ] Point-in-time recovery (PITR) or at least daily backups are enabled on the
      production project (Dashboard → Database → Backups). Take a manual backup
      right before step 5.
- [ ] Nobody has ever committed or shared the service-role key, JWT secret or DB
      password (a git-history scan was clean). If one ever leaks: Dashboard →
      Settings → API → rotate the JWT secret / API keys, reset the DB password,
      and update every place that uses them (Vercel env, EAS secrets, `supabase secrets`).

## 1. Remove the fixed test OTPs

Delete the whole `[auth.sms.test_otp]` block from the config you push. With it,
anyone can sign in as a listed number with `123456`. On a hosted project also
check Dashboard → Authentication → Providers → Phone → "Test phone numbers" is
**empty**.

## 2. Point the SMS hook at the real Edge Function

Replace the dev Postgres hook (Dashboard → Authentication → Hooks, or config):

```toml
[auth.hook.send_sms]
enabled = true
uri = "https://<project-ref>.supabase.co/functions/v1/send-sms"
secrets = "env(SEND_SMS_HOOK_SECRETS)"
```

`public.dev_send_sms` and `public.dev_peek_otp` still exist in the schema
(migration 033), but migration 055 makes them inert: they refuse / return NULL
unless `app_private.dev_flags` has `dev_otp = true`, and only `supabase/seed.sql`
(local `db reset`, never `db push`) inserts that row and grants `dev_peek_otp` to
`anon`. Check the deployed database:

```sql
select * from app_private.dev_flags;                                   -- must return 0 rows
select has_function_privilege('anon', 'public.dev_peek_otp(text)', 'EXECUTE');  -- must be false
```

The custom access token hook stays `pg-functions://postgres/public/inject_society_claims`.

## 3. Set the Edge Function secrets

Names only — generate values in a password manager, never paste them in chat or git.

```sh
# Push fan-out shared secret. Use the random value migration 055 generated…
#   select value from app_private.runtime_config where key = 'fanout_webhook_secret';
# …or choose your own and write it to BOTH places:
#   update app_private.runtime_config set value = '<secret>' where key = 'fanout_webhook_secret';
supabase secrets set FANOUT_WEBHOOK_SECRET=<same value>

supabase secrets set SEND_SMS_HOOK_SECRETS='v1,whsec_<from the hook config>'
supabase secrets set OTP_PROVIDER=msg91          # or twilio
supabase secrets set MSG91_AUTH_KEY=<…> MSG91_TEMPLATE_ID=<DLT template id>
#   (twilio instead: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
supabase secrets set PIN_PEPPER=<>= 32 random chars; SAME value as the website's PIN_PEPPER>
supabase secrets set ALLOWED_ORIGINS=https://<your-site>,https://www.<your-site>
supabase secrets set MODERATION_PROVIDER=vision  # or rekognition — see note below
supabase secrets set EXPO_ACCESS_TOKEN=<optional, recommended>
```

| Secret | Used by | If missing |
|---|---|---|
| `FANOUT_WEBHOOK_SECRET` | push-fanout, notification-fanout, booking-ack-fanout, flat-action-fanout | 500, no push sent (fail closed) |
| `SEND_SMS_HOOK_SECRETS` | send-sms | 500, no OTP sent (fail closed) |
| `OTP_PROVIDER` (+ provider keys) | send-sms | defaults to `stub` = **no SMS is sent** (nobody can log in) |
| `PIN_PEPPER` | pin-login (and the website) | 500 on every PIN action (fail closed). Never rotate casually — every PIN becomes invalid. |
| `ALLOWED_ORIGINS` | moderate-image (browser calls from the website) | browser photo posts are refused (403); the mobile app is unaffected |
| `MODERATION_PROVIDER` | moderate-image | `stub` |
| `EXPO_ACCESS_TOKEN` | fan-out functions | pushes sent without Expo access-token auth |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by
the platform; do not set them by hand.

**Image moderation is not real yet.** `vision` and `rekognition` currently
delegate to the stub, which approves every image (only a file name containing
`unsafe` is rejected). The function still enforces membership, rate limits,
file size and an image-signature check, but nothing inspects the picture. Wire a
real provider before relying on moderation.

Do not rely on `[edge_runtime.secrets]` in `config.toml` for a hosted project:
its `FANOUT_WEBHOOK_SECRET` is a public local value. The triggers skip the call
(outbox row marked `no_webhook_secret`) when the DB value is missing.

Also set the functions base URL the triggers call:

```sql
update app_private.runtime_config
   set value = 'https://<project-ref>.supabase.co/functions/v1'
 where key = 'functions_base_url';
```

Edge Function JWT settings (each function's `config.toml`, deployed with it):
`moderate-image` verify_jwt = true; `pin-login`, `send-sms` and the four
fan-outs verify_jwt = false (they authenticate with their own secret / signature
/ user token). Deploy with `supabase functions deploy <name>` — no `--no-verify-jwt`
override for moderate-image.

## 4. Dashboard settings (config.toml is local — set these by hand)

Authentication → Settings / Providers / Rate limits / URL configuration:

| Setting | Value |
|---|---|
| Site URL | `https://<your-site>` (exact) |
| Redirect URLs | exact URLs only, e.g. `https://<your-site>`, `parisar://` — **no wildcards** |
| JWT expiry | 3600 s |
| Refresh token rotation | ON, reuse interval 10 s |
| Allow new users to sign up | ON (phone OTP sign-up needs it) |
| Anonymous sign-ins | OFF |
| Manual account linking | OFF |
| Phone provider | ON, SMS OTP expiry **≤ 300 s**, OTP length **6**, test numbers **empty** |
| Email provider | OFF unless a staff account signs in by email — check first: `select count(*) from auth.users where email is not null;` |
| Email "Confirm email" | ON if the email provider stays on |
| Minimum password length | ≥ 6 (PIN secrets are 47 chars; nobody types a password) |
| Rate limits | SMS sent ≤ 30 / h; token verifications ≤ 30 / 5 min; sign-ups + sign-ins ≤ 10–30 / 5 min per IP (the per-phone PIN lockout is the main control; raise only if real users hit 429s — server-side PIN logins come from Vercel/edge IPs) |
| CAPTCHA | optional; recommended (Turnstile) if OTP abuse appears |
| MFA | not used |
| Leaked-password protection | n/a (no user-chosen passwords) |

Database / API:

| Setting | Value |
|---|---|
| Settings → Database → SSL enforcement | **Enforce SSL on incoming connections** |
| Settings → Database → Network restrictions | allow only the IPs that need a direct DB connection (your office/CI); the apps use the HTTPS API, not the DB port |
| Settings → API → Exposed schemas | `public` (and `graphql_public` only if GraphQL is used) — **never** `app_private` |
| Database → Extensions → `pg_graphql` | disable if unused (the apps only use REST) |
| Storage → Settings → S3 protocol | OFF unless you use S3 clients |
| Storage → global upload limit | ≥ 20 MiB (the bucket limit set by migration 057) |
| Auth → Sessions (Pro) | optional: inactivity timeout, e.g. 30 days |

## 5. Apply migrations 054 → 057 (staging first)

054 (tenant lockdown), 055 (logic + infra), 056 (auth hardening) and 057
(security hardening) have never run on a hosted project. Apply them in filename
order with `supabase db push` against **staging**, verify (step 6), deploy the
matching web + mobile builds to staging and click through: login (OTP + PIN),
join a society, file a complaint with a photo, respond as board, post a notice
with a PDF, community post with a photo, booking, poll vote, SOS. Only then
repeat on production, together with the new web/mobile builds (old app builds
call RPCs and storage paths that 054 refuses).

057 fails on purpose (and rolls back) if, at the end, a `public` table still has
RLS off or an app function is still executable by `anon` — read the error, fix,
re-run.

Behaviour 057 adds that clients must handle (error text contains the code):
`COMPLAINT_RATE_LIMITED` (10 complaints / hour / user), `NOTICE_RATE_LIMITED`
(20 notices or polls / hour / board user), `COMMENT_RATE_LIMITED` (30 comments /
10 min / user); over-long text fails with a check-constraint error
(`<table>_<column>_max_len`); uploads other than JPEG/PNG/WebP/HEIC/HEIF/GIF/AVIF/PDF
or over 20 MiB are refused by Storage.

**Future migrations:** since 057, new functions are not executable by `anon` /
`PUBLIC` by default. Grant `authenticated` explicitly (as 054–057 do) and grant
`anon` only for a deliberate pre-login RPC.

## 6. Verify after each deploy (SQL editor)

```sql
-- a) every public table has RLS on (expect 0 rows)
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;

-- b) no app function callable by anon (expect 0 rows on production)
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and p.prorettype <> 'trigger'::regtype
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and has_function_privilege('anon', p.oid, 'EXECUTE');

-- c) SECURITY DEFINER functions without a pinned search_path (expect 0 rows)
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','app_private') and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- d) policies that allow everything. Expected: the two public lead-form INSERT
--    policies (society_enrollment_requests, sales_applications — column grants +
--    throttle trigger limit them) and features_read_all (feature catalogue,
--    signed-in users only). Anything else needs a reason.
select tablename, policyname, cmd, roles from pg_policies
 where schemaname = 'public' and (qual = 'true' or with_check = 'true');

-- e) storage bucket
select id, public, file_size_limit, allowed_mime_types from storage.buckets;  -- public = false

-- f) realtime tables
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;

-- g) dev switches are off
select * from app_private.dev_flags;                                           -- 0 rows
```

Then, with the **anon key only** (no session), from a terminal:

```sh
curl -s "https://<ref>.supabase.co/rest/v1/profiles?select=*" -H "apikey: <anon>"            # → []
curl -s -X POST "https://<ref>.supabase.co/rest/v1/rpc/admin_stats" -H "apikey: <anon>"      # → 42501 permission denied
curl -s -X POST "https://<ref>.supabase.co/functions/v1/push-fanout" -d '{}'                 # → 401
curl -s -X POST "https://<ref>.supabase.co/functions/v1/send-sms" -d '{}'                    # → 401 (bad signature)
```

## 7. Run the gate

```sh
node scripts/check-no-dev-otp.mjs --deploy
```

It fails while `config.toml` still has `test_otp` or the `dev_send_sms` hook.
CI runs the same script without `--deploy` on every push: it fails if a
`[remotes.*]` section or a workflow running `supabase config push` would carry
the dev settings to a hosted project.

## 8. After go-live

- Legacy PIN passwords (`pk1.…`, migration 056) are upgraded on each user's next
  PIN login. After ~30 days clear the rest so they cannot be guessed through
  GoTrue directly (see contract 056 / `reset_member_pin`).
- Schedule `app_private.auth_throttle_prune()` and a cleanup of
  `public.edge_rate_events` older than a day with pg_cron (optional; both tables
  self-trim per key).
- Watch Auth logs for 429s and Edge Function logs for `refusing` / `fail closed` lines.

## Local development (unchanged)

`supabase start` / `supabase db reset` apply the migrations and then
`seed.sql`, which turns on the dev OTP flag, re-grants `dev_peek_otp` to `anon`,
and sets `fanout_webhook_secret` to `local-dev-fanout-secret-not-for-production`
— the same value as `FANOUT_WEBHOOK_SECRET` in `[edge_runtime.secrets]`. For
`supabase functions serve`, put `FANOUT_WEBHOOK_SECRET=<that value>` (and
optionally `PIN_PEPPER`) in `supabase/functions/.env` (git-ignored). Without
`ALLOWED_ORIGINS`, a local stack allows `http://localhost:3000` and
`http://127.0.0.1:3000` for moderate-image.

## Rotating the fan-out secret

1. `supabase secrets set FANOUT_WEBHOOK_SECRET=<new>`
2. `update app_private.runtime_config set value = '<new>' where key = 'fanout_webhook_secret';`

Pushes enqueued between the two steps are rejected (401) and not retried.
