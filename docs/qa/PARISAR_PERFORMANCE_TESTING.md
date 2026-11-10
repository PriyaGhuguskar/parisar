# Parisar Performance Testing (area: secperf)

Date: 10 November 2026. Environment for measured numbers: the developer laptop (8 CPUs, ~15 GB RAM, other services running), `next dev` (DEV mode, not a production build), Supabase local in Docker.

**Important:** there is no staging environment. Everything in Part B is a **local dev-mode baseline** at low concurrency (10 to 50 virtual users). It says nothing reliable about production. **Capacity for 100, 500, 1,000, 2,000 or 5,000 concurrent users is NOT demonstrated** by this work. Part A is the plan to demonstrate it on staging.

## Scope notes

- **Maintenance billing does not exist.** Confirmed by read-only SQL: no table or function for resident maintenance bills, dues or invoices. `society_billing` / `society_payments` / `admin_set_billing` are Parisar's platform billing of societies, not residents. REPORT.md section 9 also lists maintenance bills and payments as having no backend. The "maintenance" scenario is therefore omitted from the plan; add it when the module exists.
- Visitor requests exist (`guard_create_visit`, `visitor_requests` table). Excel import exists (`import_validate_rows`, `import_confirm_batch`). Notifications exist (`notifications` table, fan-out Edge Function).

## Part A. Staging performance test plan

### A1. Environment required

| Item | Requirement |
|---|---|
| Web | Production build (`next build && next start`, or the real host, e.g. Vercel) — never `next dev` |
| Supabase | A dedicated staging project on the same plan/compute size as production (connection pooler/Supavisor enabled) |
| Data | A seeded `LOAD-` dataset: 20 societies x 250 flats (5,000 flats), ~6,000 memberships, 50k complaints, 100k notifications, 20k visitor requests, 5,000 posts |
| Accounts | 5,000 staging test numbers mapped to a fixed staging OTP (staging-only `test_otp`), with PINs set by a seeding script; 100 authority accounts; 40 guard accounts |
| Load generators | k6 on 2+ machines outside the staging network (5,000 VUs needs ~2-4 GB RAM per 1,000 VUs); or k6 Cloud |
| Monitoring | Supabase dashboard (CPU, memory, DB connections, pooler), `pg_stat_statements`, Vercel/host metrics, k6 output to InfluxDB/Prometheus + Grafana |
| Rate limits | GoTrue per-IP limits (sign-in 10 / 5 min, verify 30 / 5 min) will dominate any login test from few IPs. For the login scenario either raise them on staging for the test window or distribute generators; record which |

### A2. Scenarios

| # | Scenario | Script | Type | Description |
|---|---|---|---|---|
| S1 | Simultaneous login | `login-burst.js` | Write (auth) | N users verify OTP at the same moment (per-vu-iterations, 1 each). PIN step measured separately through the web app |
| S2 | Resident dashboard + lists | `read-mix.js` | Read | `resident_dashboard`, `my_society_features`, complaints/notifications/posts/amenities lists, think time 3-8 s |
| S3 | Authority dashboard + resident access | `admin-dashboard.js` | Read | `society_admin_dashboard`, `manager_list_society_residents`, memberships, visitor requests |
| S4 | Visitor requests + notifications | `visitor-and-notify.js` | Write + read | Guards create visits at a constant arrival rate while residents poll pending visitors and notifications. Add a Realtime subscriber variant (k6 websockets) |
| S5 | Excel import | `import-validate.js` | Write (admin) | Low concurrency (1, 5, 10 admins), batch sizes 100 / 500 / 1,000 / 5,000 rows; latency vs rows; cancel batches afterwards |
| S6 | Public landing | `landing.js` | Read, anon | `/` and `/connect` |
| S7 | Soak | `read-mix.js` with `HOLD=2h` at 50% of the best passing level | Read | Memory leaks, connection growth |
| S8 | Spike | `read-mix.js` with `RAMP=30s` to 2x the level | Read | Recovery time |

Excluded from load on purpose: OTP **sending** (real SMS cost, provider limits), connect-request submission (it is rate limited by design; test the limiter functionally), maintenance billing (does not exist).

### A3. Load levels

Run each of S2, S3, S6 (and S4 with residents) at **100, 500, 1,000, 2,000, 5,000** concurrent VUs: 2 min ramp, 10 min hold, 1 min ramp down. S1 at 100, 500, 1,000, 2,000, 5,000 simultaneous logins. A mixed run at each level: 70% S2, 10% S3, 10% S4, 10% S6. Stop raising the level when a threshold fails twice in a row; that level minus one is the demonstrated capacity.

### A4. Metrics and pass thresholds

| Metric | Source | Pass threshold (proposal) |
|---|---|---|
| Latency p50 / p95 / p99 | k6 `http_req_duration` per tag | reads p95 < 800 ms, p99 < 2 s; login p95 < 1.5 s; import 1,000 rows p95 < 10 s |
| Throughput (RPS) | k6 `http_reqs` | report per level |
| Error rate | k6 `http_req_failed`, checks | < 1% (429 counted separately) |
| CPU | Supabase DB CPU, web host CPU | < 75% sustained |
| Memory | DB memory, Next server RSS | no growth over soak |
| DB connections | `select count(*) from pg_stat_activity`, pooler stats | < 80% of pool max, no "too many connections" |
| Queue backlog | `notifications` fan-out: pending webhook / `net.http_request_queue` rows; Realtime message lag | backlog drains within 60 s after the spike |
| Slow queries | `pg_stat_statements` top 20 by total time | none > 500 ms mean |

### A5. How to run

```
cd docs/qa/scripts/perf
export SUPABASE_URL=https://<staging>.supabase.co SUPABASE_ANON_KEY=<from secret manager> TEST_OTP=<staging code>
./mint-tokens.sh phones.txt > tokens.json      # never commit tokens.json; delete after the run
k6 run -e TARGET_VUS=500 -e SOCIETY_ID=<uuid> -e TOKENS_FILE=tokens.json read-mix.js
```

Scripts read every secret from the environment; none is stored in the repo. Tokens expire after 1 hour (`jwt_expiry = 3600`), so long runs must re-mint or refresh.

### A6. Risks to watch (from code review)

- Every dashboard is a `SECURITY DEFINER` RPC that runs several `count(*)` sub-queries per call; at 5,000 users this is the likely hot spot. Check indexes on `society_id`, `status`, `created_at`.
- RLS policies call helper functions per row (`current_society_id()`); check they are `STABLE` and wrapped as `(select ...)` so Postgres caches them.
- `next dev` numbers are not representative: dev mode compiles on demand and disables caching.

## Part B. Local dev-mode baseline (measured 10 Nov 2026)

**What this is:** a short, read-only smoke baseline on the developer laptop (8 CPUs, 15 GB RAM, VS Code and other containers running). Next.js ran in **development mode** (`next dev`), which compiles on request and is far slower than a production build. Supabase ran locally in Docker. Tool: autocannon 8, 20 seconds per run, no think time. One test user (owner 9000000017, QA Sunrise Heights) for the authenticated calls.

**What this is not:** evidence of production capacity. **No claim of 100, 500, 1,000, 2,000 or 5,000 concurrent-user capacity is made.** Those levels must be run on staging with Part A.

### B1. Results

| Target | Connections | Requests in 20 s | Avg RPS | p50 ms | p90 ms | p97.5 ms | p99 ms | Max ms | Errors | Non-2xx |
|---|---|---|---|---|---|---|---|---|---|---|
| `POST /rest/v1/rpc/resident_dashboard` | 10 | 20,157 | 1,008 | 97 | 206 | 326 | 359 | 450 | 0 | 2 |
| same | 25 | 13,589 | 679 | 90 | 242 | 333 | 380 | 614 | 0 | 0 |
| same | 50 | 14,465 | 723 | 104 | 282 | 427 | 518 | 1,016 | 0 | 0 |
| same (rerun) | 10 | 16,812 | 841 | 106 | 166 | 205 | 231 | 299 | 0 | 0 |
| `GET /rest/v1/complaints?limit=20` | 10 | 16,903 | 845 | 108 | 177 | 223 | 243 | 317 | 0 | 0 |
| same | 25 | 9,963 | 498 | 93 | 273 | 369 | 436 | 604 | 0 | 0 |
| same | 50 | 10,755 | 538 | 123 | 291 | 414 | 505 | 1,047 | 0 | 0 |
| `GET /` landing page (Next.js **dev mode**) | 10 | 82 | 4 | 2,135 | 3,107 | 3,734 | 4,165 | 4,165 | 0 | 0 |
| same | 25 | 65 | 3 | 6,569 | 8,067 | 8,766 | 8,778 | 8,778 | 0 | 0 |
| same | 50 | 59 | 3 | 11,709 | 14,802 | 15,222 | 15,374 | 15,374 | 0 | 0 |

The tool reports p97.5 rather than p95; p95 lies between the p90 and p97.5 columns.

### B2. Resources during load

| Moment | Postgres CPU | PostgREST CPU | Kong CPU | Postgres memory | Postgres connections | Host |
|---|---|---|---|---|---|---|
| During `resident_dashboard`, 10 connections | 98% (about one core) | 54% | 24% | 302 MiB | 42 | CPU 81% user, 0.7% idle; swap almost full (1.9 of 2 GB) |
| During landing page, 10 to 50 connections | under 1% | under 1% | under 1% | 295 MiB | 42 | `next-server` 119% CPU, 0.9 GB RSS |

### B3. What the baseline shows

1. **The database API scales out of this box, not up.** Throughput peaks at about 700 to 1,000 requests per second at 10 connections and does not rise with more connections; latency grows instead (p99 roughly doubles from 10 to 50). Postgres is pinned near one core while the laptop has no idle CPU, so the limit here is the laptop, not the code. A staging run on dedicated hardware is required before any capacity statement.
2. **No errors under read load.** Zero socket errors and 2 non-2xx responses out of about 105,000 API requests (cause not captured; re-check on staging).
3. **Dev-mode page rendering is unusable for load measurement.** 3 to 4 pages per second with multi-second latency is the expected cost of `next dev`. Re-run the landing and dashboard pages against `next build && next start` (or the Vercel preview) on staging.
4. **Database connections stayed at 42** (PostgREST pool plus Supabase services), well inside the default limit. Watch pool saturation at 500+ users on staging.
5. **Not measured locally, by design:** write paths (complaints, visitors), OTP login bursts, notifications fan-out and Excel import. These either send OTPs, create data or need the push worker, which is not running locally (see CORE-034 in the screen tests). They are covered by the staging scripts in `docs/qa/scripts/perf/`.

### B4. Readiness verdict for performance

**Not Tested at the required scale.** The 100 to 5,000 concurrent-user targets have no evidence yet. Run Part A on staging before release.
