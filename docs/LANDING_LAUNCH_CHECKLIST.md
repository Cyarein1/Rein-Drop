# Landing page - production launch checklist

_Prepared 2026-10-13 (Landing 24 = step 71), after the preview passed end to end (section 0).
Tick as you go. **Who:** "you" = the owner; "agent" = can be done as a numbered step on request.
Nothing here is automated: CI checks code, it never deploys (decision 0015)._

How to deploy: [deploy/LANDING_DEPLOYMENT.md](deploy/LANDING_DEPLOYMENT.md) (options, settings,
preview, CI) and the Azure runbook [azure/BETA_DEPLOYMENT.md](azure/BETA_DEPLOYMENT.md). The app
beta has its own list: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## 0. Preview evidence (done - step 71)

Production images (`docker-compose.preview.yml`: Postgres 18, migrations, API, web) on this machine,
2026-10-13:

- [x] Migrations applied on an empty database (23, including `20261012211858_waitlist_signup`).
- [x] **Live waitlist** (`check-waitlist-e2e.mjs`, phone width 375 px): **7/7**
  - form sign-up shows the confirmation;
  - exactly one row with the normalized email, `etsy,other`, the "Other" name and consent version
    `2026-10-12`;
  - repeat sign-up (different case) gets the same answer and there is still one row;
  - the honeypot gets a 202 and stores nothing;
  - an invalid email shows a message;
  - neither the email nor the "Other" name appears in any web / API log or analytics event.
- [x] **Whole landing** (`check-landing.mjs`, `ANALYTICS_MODE=console`): **256/256**, no skips
  - marketplace labels: nothing says Live or Beta (launch target / coming soon / exploring);
  - illustrative labels on the deal card and the demo;
  - privacy / terms drafts carry the draft banner and stay noindex;
  - contact placeholder;
  - 320 / 375 px with no overflow;
  - analytics: only catalog events and properties, GPC respected, nothing stored in the browser;
  - SEO without `SITE_URL`: noindex, block-all robots;
  - the real sign-up route returns the confirmation.
- [x] CI workflow added (`.github/workflows/ci.yml`): the same two checks run on every PR against a
  Postgres service container. **Not yet run on GitHub** - the first push shows it.

## 1. Blockers - must be done before the public URL exists

| # | Item | Who | Check |
|---|---|---|---|
| B1 | **Gate the `/dev` pages** (`/dev`, `/dev/ui`, `/dev/diagnostics`, `/dev/notifications`) - only `/dev/landing` returns 404 in production today; the others render in the production build | agent (on request) | `curl -o /dev/null -w "%{http_code}" <url>/dev/ui` -> 404 for each |
| B2 | **Legal review** of `/privacy` and `/terms` (every "To be confirmed" point: entity, contact officer, providers and countries, legal basis, retention, rights, liability, governing law). Then set `reviewed: true` in `legal-drafts.ts` | you + lawyer | Draft banner gone; pages indexable; the consent version is bumped if the consent words change |
| B3 | **`CONTACT_EMAIL`** - a monitored address that isn't a personal one (the privacy draft tells people to write there to remove their sign-up) | you | Footer, legal pages and the form's error help show the address |
| B4 | **Retention + access** for `WaitlistSignup`: how long rows are kept, who on the team may read the table, how a deletion request is handled (D38) | you | Written into the privacy notice (B2) |
| B5 | **How sign-ups hear from you** - the confirmation says "We'll be in touch by email"; there is no email provider (D14). Either export and email manually, or wire a provider first | you | Decision recorded |
| B6 | **Trademark review** - 17 marketplace marks, App Store / Google Play badges, Apple / Sony products in example photos (decision L-D6) | you | Each mark either approved or replaced with text |
| B7 | **Design approval** (Gate A / Gate C) and the mascot question (droplet vs the mockup's deer) | you | Sign-off |
| B8 | **Demo and hero figures** sanity-checked by a reseller (they're labelled illustrative but must not look wrong) | you | Sign-off |

## 2. Decisions that shape the build (before building production images)

- [ ] **Hosting option** - A (Azure Container Apps, recommended), B (one VM) or C (PaaS) -
  [LANDING_DEPLOYMENT.md §2](deploy/LANDING_DEPLOYMENT.md). **Who:** you.
- [ ] **Database** - external free-tier Postgres or Azure Flexible Server (D39); TLS required.
- [ ] **Region** (D40) and a **Cost Management budget with alerts** created *before* the first
  deploy (runbook §7).
- [ ] **Analytics provider** - none is fine for launch (production sends nothing). If one is chosen:
  add it to `PROVIDERS` with an honest `requiresConsent`, prefer cookieless, update the privacy
  notice first (step 68).
- [ ] **Web `minReplicas`** - 1 (no cold start for the first visitor, small fixed cost) or 0.
- [ ] **Public domain** - decides `SITE_URL`; DNS + managed certificate (backlog B-31 for custom
  domains on Container Apps).

## 3. Build (production images)

- [ ] CI green on the release commit (checks, preview e2e, image builds).
- [ ] Web image built with the **production** build args - they're inlined at build time, so a
  preview image can't be promoted:
  - `SITE_URL=https://<public domain>` (no trailing path);
  - `CONTACT_EMAIL=<B3>`;
  - `APP_STORE_URL` / `GOOGLE_PLAY_URL` **empty** until the apps are published;
  - `NEXT_PUBLIC_LANDING_ANALYTICS_PROVIDER` empty (or the chosen provider).
- [ ] API and migrate images from the same commit; tag = commit SHA; pushed to GHCR (runbook §3).
- [ ] No secrets in build args, Bicep parameters or CI logs (runtime secrets come from Key Vault
  references).

## 4. Deploy (runbook §4)

- [ ] Database reachable from the API only (firewall / `sslmode=require`).
- [ ] Run the migrate job; confirm `WaitlistSignup` exists.
- [ ] Deploy API, then web. Web `API_BASE_URL` points at the API's internal / HTTPS address.
- [ ] Ingress adds exactly **one** `X-Forwarded-For` hop (the web rate limiter keys on the
  rightmost entry - step 66). Check once with a request header dump in the logs.
- [ ] One web instance and one API instance (rate limits are in memory; more instances need a
  shared store - backlog B-05).

## 5. Verify production (read-only, by hand)

Never run the writing scripts against production (they refuse without `ALLOW_WRITES=1`).

- [ ] `/` loads on a phone over mobile data; hero, demo, gallery, FAQ, form visible.
- [ ] View source: `<link rel="canonical" href="https://<domain>/">`, `robots` meta absent
  (indexable), JSON-LD present; `/robots.txt` allows `/` and lists the sitemap; `/sitemap.xml`
  lists the public pages.
- [ ] Rich Results Test / Schema Markup Validator on the public URL - no errors.
- [ ] Share the URL in a chat app - social image and title appear.
- [ ] `/privacy`, `/terms`: reviewed text, no draft banner (after B2).
- [ ] `/dev`, `/dev/ui`, `/dev/diagnostics`, `/dev/notifications`, `/dev/landing` -> 404 (B1).
- [ ] **One real sign-up with your own address** -> confirmation; one row in the table (read by
  the person allowed in B4); a second try -> same message, still one row.
- [ ] Logs: the sign-up appears as an outcome line with no email.
- [ ] Lighthouse on the public URL (mobile) - compare with step 70 (Perf 96 real-throttled).

## 6. Go / no-go and rollback

- Go when sections 1-5 are ticked.
- **Rollback:** redeploy the previous image tag (web and API are stateless). The waitlist migration
  is additive - leave it in place.
- **Pause sign-ups** without a rollback: scale the API to 0 - the form then shows "We couldn't save
  your sign-up" with Try again and the contact path, and nothing is stored.
- **Hide from search** quickly: rebuild the web image without `SITE_URL` (noindex + block-all) and
  redeploy.

## 7. First week after launch

- [ ] Field Web Vitals (Chrome UX Report / real-user LCP, INP, CLS) - settles the simulated-LCP
  question and watches the demo's product choice (~150 ms at 4x CPU) - step 70.
- [ ] Watch API logs for waitlist rate-limit hits and 5xx.
- [ ] Manual screen-reader pass (NVDA / VoiceOver), 200 % zoom, real-device keyboard - step 69.
- [ ] Answer sign-ups per B5.
- [ ] Budget alert test fired / received.
