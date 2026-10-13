# Release checklist - first hosted beta

Ordered, tick-as-you-go list from the frozen code to testers using Rein Drop on Azure. Scope:
[MVP_FREEZE.md](MVP_FREEZE.md). Deployment detail: [azure/BETA_DEPLOYMENT.md](azure/BETA_DEPLOYMENT.md).
The public landing page has its own list: [LANDING_LAUNCH_CHECKLIST.md](LANDING_LAUNCH_CHECKLIST.md).
Each item says **who** does it (you = the owner) and **how it is checked**. Nothing here is done by
an automated pipeline.

Release tag: `beta-1` on the commit that passes section 2.

## 1. Decisions (you) - before anything is set up

- [ ] **D12 Facebook in production**: pick a production data source (with legal review), **or**
      decide that beta-1 runs eBay live and Facebook stays off. Today, without a source, production
      registers no Facebook adapter: testers can still select Facebook and go LIVE, and the Hunt
      shows "Facebook Marketplace isn't set up - Hunts can't search it until it is" while eBay
      continues (a Facebook-only Hunt finds nothing). Tell testers, or decide to hide Facebook in
      Create Hunt for beta-1 (a small change allowed under the freeze). Record the choice in OUTSTANDING.
- [ ] **D7 poll interval** for the beta (`huntPollIntervalMinutes`, default 30) - drives eBay quota
      and AI cost.
- [ ] **D39** monthly Azure budget + alert recipients; database option (free-account B1MS,
      external PostgreSQL, or paid B1ms).
- [ ] **D40** Azure region (latency, data residency).
- [ ] **D3** paid plans in beta-1: sell Pro / Ultimate (set Stripe prices) **or** Free only (paid
      plans show "Price TBD" and can't be bought). Plan limits in the seed are placeholders - confirm.
- [ ] **D38 (minimum)** backup expectation for the beta database (RPO / RTO the provider gives you).
- [ ] Privacy notice and terms for testers - mention product events (docs/telemetry/product-events.md)
      and the providers that process data (Microsoft Entra / Azure / Foundry, Stripe, eBay, Expo).

## 2. Code freeze and quality gates (you or the agent)

- [ ] Working tree clean; all step commits made.
- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm turbo run build typecheck lint test --force` - all tasks pass (58 at step 46).
- [ ] With the local database up (`pnpm infra:up`): `pnpm --filter api test:int`,
      `pnpm --filter api test:e2e`, `pnpm --filter worker test:int` all pass. (The hunt-activity
      test can flake while your own worker runs - re-run it alone before calling it a failure.)
- [ ] `pnpm audit --prod` - no new advisories in api / worker / web runtime dependencies (known
      build-tooling ones: docs/security/hardening-2026-10.md).
- [ ] `docker build` of `api`, `worker`, `web`, `migrate` succeeds.
- [ ] **Final local acceptance run**: `pnpm db:reset-demo`, then
      [LOCAL_MVP_ACCEPTANCE.md](LOCAL_MVP_ACCEPTANCE.md) start to finish, sign-off sheet filled in.
- [ ] Tag: `git tag beta-1 && git push origin beta-1` (after section 2 passes).

## 3. External services (you)

- [ ] **Entra External ID**: tenant + API, web and mobile app registrations (checklist in decision
      0013); email + password user flow; hosted page branding (optional).
      Check: `ENTRA_AUTHORITY=... ENTRA_TENANT_ID=... pnpm --filter api test` runs the live tenant
      test (not skipped).
- [ ] **eBay**: production keyset, marketplace id (`EBAY_US` or yours), quota sized for D7.
      Check: `EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=... pnpm --filter @rein-drop/marketplace-core test`
      runs the live Browse test.
- [ ] **Microsoft Foundry**: deployment chosen (D33), endpoint + key; set
      `FOUNDRY_PRICE_INPUT_PER_1M_USD` / `..._OUTPUT_...` from your price sheet so AI cost shows.
      Check: `FOUNDRY_ENDPOINT=... FOUNDRY_API_KEY=... FOUNDRY_DEPLOYMENT=... pnpm --filter @rein-drop/ai-core test`
      runs the live test; watch INVALID_OUTPUT / UNGROUNDED_OUTPUT.
- [ ] **Stripe** (only if paid plans, D3): products + prices, Customer Portal configuration, tax
      settings; test mode first (Stripe CLI `stripe listen` against a local API), then live keys.
- [ ] **Facebook source** - only if D12 chose one; otherwise skip.
- [ ] **Expo / EAS** (for push on phones, D23): EAS project, development builds for iOS / Android
      with the Entra mobile redirect URI registered.
- [ ] **Store-facing assets** (only before TestFlight / Play testing, not for development builds):
      approved app icon + splash (today Expo defaults) and a web favicon - approved artwork only.

## 4. Azure (you) - runbook docs/azure/BETA_DEPLOYMENT.md

- [ ] **Budget first** (runbook section 7) - portal or `infra/budget.bicep`; alerts reach you.
- [ ] Database ready (section 5 of the runbook), TLS (`sslmode=require`), backups enabled.
- [ ] Images built and pushed to ghcr.io with the `beta-1` commit SHA.
- [ ] Phase 1 deploy (`deployApps=false`), Key Vault secrets set (all names in the runbook).
- [ ] Phase 2 deploy (`deployApps=true`); **migration job** succeeded; plans seeded with
      `NODE_ENV=production` (no development user).
- [ ] Entra redirect URI = `entraWebRedirectUri` output; Stripe webhook = `stripeWebhookUrl`
      output, signing secret in Key Vault, apps restarted.
- [ ] Worker settings: `huntPollIntervalMinutes` = D7; `PRODUCT_EVENTS_PROVIDER` left at `log`.

## 5. Verify the hosted beta (you, with a phone)

- [ ] `GET /health` ok, `GET /ready` database up, `GET /me` 401, `/dev/*` routes not reachable.
- [ ] Response headers on web and API: HSTS, `X-Frame-Options: DENY`, CSP, no `X-Powered-By`;
      no CORS headers on the API.
- [ ] Acceptance sequence on Azure with real providers: sign up -> Seller Snapshot -> Hunt (eBay;
      Facebook per D12) -> plan gate -> LIVE -> worker searches (logs) -> deal analysed -> alert in
      inbox (+ push on a development build) -> open -> Bought -> Mark sold -> realized P/L ->
      pause / resume.
- [ ] Paid plan (if D3): Checkout in Stripe test mode -> webhook -> plan changes; cancel in the
      portal -> `cancellation` event; downgrade pauses extra Hunts.
- [ ] Product events visible in Log Analytics (KQL in docs/telemetry/product-events.md) - the 13
      events appear once each, with no titles / prices / emails.
- [ ] Source degradation visible: a failing source shows the banner and recovers (watch the worker
      logs; no need to break production - the local acceptance run covers the simulation).
- [ ] Cost after 24-48 h in Cost Management matches expectations (worker always on is the steady part).

## 6. Go / no-go and rollback

- [ ] Go when sections 1-5 are ticked; invite testers (Entra user flow open, or invited accounts).
- [ ] **Rollback**: redeploy the previous image tag (`az containerapp update --image ...` per app,
      or the previous `imageTag` in `beta.bicepparam`); migrations are additive, so the previous
      code still runs on the newer schema. Data problems: restore the database from the provider's
      backup (D38).
- [ ] **Stop spending** if needed: deactivate the worker revision (runbook "When a budget alert fires").

## 7. After release (first week)

- [ ] Daily: worker errors (`tick failed`), source health, failed billing events in the Stripe
      dashboard, AI cost per analysis, budget forecast.
- [ ] Collect tester feedback against [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md); new ideas go to
      [POST_MVP_BACKLOG.md](POST_MVP_BACKLOG.md), not into the release.
