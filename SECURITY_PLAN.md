# Security & abuse-hardening plan

Audit date: 2026-09-24. Goal: stop strangers from running up Vercel / Supabase / Resend bills or using
the site to send spam, and close the real vulnerabilities found. `npm audit` is clean and `next@16.3.5`
is past the July 2026 (16.2.11) and August 2026 (16.3.3) Next.js security releases, so no dependency work is needed.

## How to execute (for auto mode)

- Work in phase order, one commit per numbered item, on a branch `security/hardening`.
- Before each item read the matching guide in `node_modules/next/dist/docs/` (this Next.js has breaking changes; see AGENTS.md).
- After each item: `npm run lint && npm run typecheck && npm test`. For SQL items also `npm run test:db`
  (needs `SUPABASE_DB_URL`; if unavailable, write the tests anyway and say they were not run).
- New migrations: new file in `supabase/migrations/` with a timestamp after 20260923050000. NEVER push
  migrations to prod, never touch the hosted Supabase/Vercel/Resend dashboards; those are the "Manual steps" at the bottom.
- Add `src/lib/safe-next.ts` etc. with vitest tests next to them, matching existing `*.test.ts` style.
- Do not weaken any existing RLS policy. Do not add service-role usage to the Next.js app.

## Phase 1: stop the money/spam leaks (highest priority)

### 1. Contact form (`src/app/contact/actions.ts`, `contact_submissions`)
Problem: public, no captcha/rate limit; every submit = 1 DB row + 2 Resend emails, and the confirmation goes to
ANY address the submitter types (mail-bomb / spam relay from auselia.cl, burns the Resend quota; the free plan
caps at 100 emails/day, so a flood also blocks invite emails). The anon key is public, so `insert_contact_as_anyone`
also lets anyone insert rows straight through PostgREST, skipping the Next.js action entirely.
Do:
- Add a honeypot field + minimum-time-to-submit token (signed timestamp) to the form; reject silently (redirect to /contact/sent).
- Validate email format and trim/cap lengths in the action (name 200, org 200, message 4000, email 320) before touching the DB.
- Add Cloudflare Turnstile (env `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) verified server-side. Skip verification only when the secret is unset AND `NODE_ENV !== "production"`.
- Stop sending the confirmation email to the submitter, OR only send it after Turnstile passes AND max 1 per address per 24h. Recommended: drop it (the "sent" page already confirms).
- Migration: replace the anon insert policy with an RPC `submit_contact(...)` (security definer) that enforces a global cap
  (e.g. 30 rows/hour, 3 rows/hour per lower(email)) and revoke direct `insert` on the table from anon/authenticated. Update the action to call the RPC. Add db tests.
- Notification email: also skip sending if the DB cap was hit.

### 2. Invite emails (`src/app/dashboard/sharing-actions.ts`, `src/lib/dashboard/email.ts`)
Problem: (a) any free signup can create an org and invite unlimited addresses; only *resend* has a cooldown, so this is a
free email cannon from your domain. (b) `orgName` is taken from the client, not the DB, and is interpolated into the
invite HTML with no escaping, so an attacker can inject arbitrary HTML/links into an email sent from your domain
(phishing). (c) `acceptUrl` is built from the request `Origin` header.
Do:
- Add `escapeHtml()` in `src/lib/email/` and use it on every interpolated value in `renderInviteHtml` (org, inviter, role, url attr). Also strip CR/LF from the subject.
- In `createInvite`/`resendInvite`, ignore the client `orgName`; read the org name from the DB (`organizations`, RLS scoped) after the insert.
- Migration: trigger on `org_invitations` insert limiting to 10 invitations/org/24h and 25 pending per org; owner accounts younger than 1 hour cannot invite (or require confirmed email, see item 3).
- Replace `headers().get("origin")` with a `SITE_URL` env var (fallback to origin only in dev) in invites, signup and forgot-password.

### 3. Signup / forgot-password / login (`src/app/(auth)/*/actions.ts`)
Problem: no captcha; forgot-password and signup (when confirmations are on) make Supabase send email to arbitrary
addresses; error messages from Supabase are reflected in the URL. Local config has `enable_confirmations = false` and
`minimum_password_length = 6` (verify prod, see manual steps).
Do:
- Turnstile on signup, login, forgot-password (pass `options.captchaToken` to supabase-js; Supabase captcha is enabled in dashboard, see manual steps).
- Do not reflect `error.message`: map to a small set of codes (`?error=invalid_credentials|signup_failed|generic`) and render translated copy from those. Applies to login, signup, forgot-password, reset-password, dashboard, `auth/callback`.
- `supabase/config.toml`: `enable_confirmations = true`, `minimum_password_length = 10`, `secure_password_change = true`, `max_frequency = "60s"`, and tighten `[auth.rate_limit]` (`sign_in_sign_ups = 10`).
- Signup must not create an org before email confirmation (already true when confirmations are on); keep that path.

### 4. Cap org/plant creation (SQL)
Problem: `insert_own_org` lets any signed-in user create unlimited organizations; editors can create unlimited plants.
Do (one migration + db tests): trigger limiting a user to 3 owner memberships; trigger limiting an org to 20 plants; unique `name` length check (<= 200) on organizations/plants.

### 5. The proxy calls Supabase on EVERY page view (`src/proxy.ts`)
Problem: `supabase.auth.getUser()` runs for every non-static request, including all marketing pages, so every bot/crawler hit
= one Vercel invocation + one Supabase Auth request, pure cost with no value on public pages.
Do: narrow `config.matcher` to `/dashboard/:path*`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/auth/:path*`
(and `/demo` only if it truly needs a refreshed session; it does not, it is public). Early-return `NextResponse.next()` if there is no `sb-` auth cookie. Add a test for the matcher.

## Phase 2: real vulnerabilities

### 6. Open redirects
- `src/app/auth/callback/route.ts`: `${origin}${next}` with `next=@evil.com` produces `https://auselia.com@evil.com`, a working open redirect. 
- `login/actions.ts` accepts `/\evil.com` (browsers treat `/\` as `//`).
Do: create `src/lib/safe-next.ts` exporting `safeNext(raw, fallback="/dashboard")` that requires a single leading `/`, rejects `//`, `\`, `@`, control chars, and finally verifies `new URL(raw, "http://x").origin === "http://x"`. Use it in login, signup, callback, accept-invite. Unit-test with the payloads above.

### 7. Security headers (`next.config.ts` is empty)
Add `headers()`: `X-Frame-Options: DENY` (+ CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/mic/geolocation off), `Strict-Transport-Security`, and a CSP (start with `Content-Security-Policy-Report-Only` allowing self, the Supabase URL for connect/img, Turnstile, and map tile hosts used by `map-view.tsx`; check that file for the tile domain; then enforce). Set `poweredByHeader: false`.

### 8. Public demo egress (`/demo`, anon reads)
Problem: the demo org is readable by anon through PostgREST directly (the anon key is public by design). `cavitation_captures.y` is an int array (~1200 points) and up to 1000 rows/request are allowed, so a script can pull many MB per call straight from Supabase, bypassing Vercel and any WAF; also `select("*")` on readings in `farm-dashboard.tsx`.
Do (do the cheap parts automatically, ask the owner about the last bullet):
- Lower `[api] max_rows` to 500 in config.toml and bound every client query with `.limit()`/date range (readings, captures list); never `select("*")` on readings.
- Cap `cavitation-delete`/list page sizes.
- OPEN DECISION (leave as a TODO in the plan file, do not implement): serve demo data through a cached Next.js route/`use cache` and revoke anon SELECT on demo tables, so anon cannot hit PostgREST at all.

### 9. Edge functions (`supabase/functions/*`, all `verify_jwt = false`)
Problem: the "platform gate" is the publishable key, which is public, so there is effectively no gate before our code runs; unauthenticated requests each cost an invocation + a DB lookup, and a leaked device key can flood `readings` (no dedupe, no retention).
Do:
- In `_shared/device.ts`: reject early when `x-api-key` is missing/too long (>128 chars) or not `^[A-Za-z0-9_-]{32,128}$` before hitting the DB; add a `Content-Length` guard (ingest 10 KB, cavitation-ingest 12 MB, scope-sync existing 200 KB, checked BEFORE `req.json()`).
- `ingest`: per-plant throttle (reject with 429 if the plant's latest reading is < 5 s old; do it with one indexed query), range-check values (soil 0-100, humidity 0-100, temp -60..120, pressure 300..1200, weight 0..1e6) and don't `select()` the row back.
- `cavitation-ingest`: reject if decoded `full_b64` would exceed MAX_FULL_BYTES BEFORE decoding (check string length * 3/4); only accept a full waveform for keys in this batch that were valid.
- Migration: retention job note only (pg_cron delete of readings older than the retention chosen by the owner) as a documented TODO, since it deletes data.
- Confirm in the migration/seed how device keys are generated; add a comment that they must be >= 32 random bytes (SHA-256 is only safe for high-entropy keys). Do not rotate any keys.

### 10. Minor
- Remove `SUPABASE_SERVICE_ROLE_KEY` from `.env.example` (the Next app never uses it; keeping it invites putting it in Vercel env).
- `RESEND_API_KEY`: split contact vs invites sends by helper so a per-purpose cap can be enforced in `src/lib/email/resend.ts` (simple in-memory + DB-backed counters are NOT reliable on serverless; rely on the DB triggers from items 1-2 instead).
- Add a `SECURITY.md` with a contact address and `public/.well-known/security.txt`.
- Add `npm audit --omit=dev --audit-level=high` and `dependabot.yml` (npm + github-actions) to CI.

## Manual steps for the owner (dashboards; auto mode must not do these)

Vercel (biggest protection against a surprise bill):
1. Team Settings > Billing > Spend Management: set an On-Demand Budget (e.g. $20) with "Pause production deployments" ON and notifications/webhook. https://vercel.com/docs/spend-management
2. Project > Firewall: turn on Bot Protection (Challenge), and add WAF rate-limit rules: `POST /contact*` 5/min per IP, `POST /login|/signup|/forgot-password` 10/min per IP, `/demo` 30/min per IP, everything else 300/min per IP. Persist "deny" for 1h on breach. https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
3. Keep "Attack Challenge Mode" in mind as a panic button during a flood.

Supabase:
1. Organization > Billing: make sure Spend Cap is ON (if on Pro) so overages block instead of billing. https://supabase.com/docs/guides/platform/cost-control
2. Auth > Attack Protection: enable CAPTCHA (Turnstile) with the secret used above; Auth > Rate Limits: lower email sends and sign-ups/sign-ins to what you actually need; set min password length 10+; enable leaked-password protection if your plan has it; email confirmations ON.
3. Auth > URL Configuration: Site URL = production domain, redirect allow-list = exact production URLs only, no wildcards, no localhost in prod.
4. Auth > SMTP: if a custom SMTP (Resend) is configured, make sure it uses its own API key, separate from the contact-form key.
5. Check Edge Function logs/Reports for unexpected traffic after deploy.

Resend:
1. Use separate API keys (contact form, invites/auth) with "Sending access" only, restricted to the `auselia.cl` domain. Rotate the current key after this work ships.
2. Check your plan's monthly quota and overage settings and set usage alerts. On the free plan the 100/day cap is itself the attack surface (a flood blocks real mail). https://resend.com/docs/api-reference/rate-limit

## Verification checklist after Phase 1-2
- `npm run lint && npm run typecheck && npm test && npm run build` green.
- New db tests prove: anon cannot insert into `contact_submissions` directly; 31st contact/hour is rejected; a user cannot own a 4th org; an org cannot create a 21st plant or exceed invite limits.
- Manual: `/auth/callback?code=x&next=@evil.com` and login `next=/\evil.com` land on `/dashboard`.
- Manual: an invite for an org named `<a href=x>` renders as literal text in the email HTML.
- `curl -I` on the deployed preview shows the new headers.
