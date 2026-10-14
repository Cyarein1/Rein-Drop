# Known limitations - MVP / beta-1

What testers and operators will run into with the frozen MVP, so nobody mistakes them for bugs.
Each has the backlog item (B-xx, [POST_MVP_BACKLOG.md](POST_MVP_BACKLOG.md)) or open decision
(D-xx, [OUTSTANDING.md](OUTSTANDING.md)) that would change it. Scope: [MVP_FREEZE.md](MVP_FREEZE.md).

## For testers (product)

**Marketplaces and searching**
- **Facebook Marketplace has no production source yet (D12).** In the hosted beta, Facebook shows
  "isn't set up - Hunts can't search it until it is"; eBay keeps working. A Facebook-only Hunt can
  go live but finds nothing. (Locally, Facebook uses a development provider.)
- Only eBay and Facebook - no other marketplaces (B-01).
- Each eBay check reads one page of up to 200 results; Hunts are checked every
  `huntPollIntervalMinutes` (30 in the beta template, D7) - not real time, and no faster "Hot Hunt"
  tier (B-02).
- Location is free text; distance isn't verified for sources that can't filter by radius (B-20).
- Matching is word-based (English stopwords); synonyms are only caught by the AI step (B-07).
- A listing that sells or is removed **stays in your feed as open** until it ages out; editing a
  live Hunt doesn't re-check the deals it already found (B-36).

**Deals and alerts**
- Alerts are in-app always, and push only on a development build of the app (Expo Go uses
  simulated tokens - D23). No email alerts (B-16, D14).
- At most one alert per deal, never repeated or upgraded; no quiet hours or digests (D22).
- Only listings up to 48 hours old can alert (D10); deals without a max price and target never
  alert before resale data exists (D11).
- **No resale estimates**: Rein Drop has no comparable-sales source, so "estimated resale / upside"
  shows as unavailable and auctions are judged on their current bid (D13, B-18). Strength bands
  (Strong / Exceptional) use placeholder thresholds (D8).
- Ignore reasons are stored but don't yet filter similar listings (B-17); a Bought can be edited but
  not fully undone (B-17).
- Listing photos aren't shown on deal cards (B-22).

**Plans and billing**
- Plan limits and prices are placeholders until D3; paid plans show "Price TBD" when no price is set.
- Paid plans are bought and managed on the **web** only. The mobile apps are companions that don't mention buying at all: no prices, plan picker or "subscribe on the web"; limits are explained as "your current access" (decision 0018, step 77). Store-compliance review before public release (phase E). Invoices and
  receipts are Stripe's (Customer Portal).
- After a downgrade, the most recently started Hunts above the new limit are paused automatically
  (nothing is deleted); you can't choose which stay live yet (B-15).
- Hot Hunts appear as "coming later" (B-02).

**Outcomes and analytics**
- One inventory row per physical item - no lots / quantities (D17); no returns or write-offs (B-19).
- Profit is never converted between currencies: a sale in a different currency from the purchase
  shows "result unavailable" (D27).
- Home's "spent" counts purchase prices; Analytics' "spent" adds purchase costs (B-19).
- Default purchase / sale dates use the device's time zone (D24).
- Home "this period" is the last 30 days (D24).

**Account and app**
- Sign-in is Microsoft Entra's hosted page (email + password); no welcome screen, no social
  sign-in (B-10, B-11, D35). Sessions last 7 days, then sign in again (D34).
- No self-service account deletion; email / name changes in Entra don't sync (B-34).
- English only (B-21). Non-resellers see a "coming soon" screen (D4, B-12).
- The mobile app has not yet been run end to end on a real device (release checklist section 5).
- App icon / splash are Expo defaults; the web has no favicon (release checklist, brand).

## For operators (platform)

- **Not yet run against the real providers**: Entra, Stripe, eBay production keys, Foundry and real
  push were tested with fakes / mocks (release checklist sections 3 and 5). Foundry prompts are
  unproven on a real model.
- **One API replica** (in-memory rate limits) and one always-on worker; the API and web scale to
  zero, so the first request after idle is slow (cold start) (B-05, decision 0015).
- Database: external PostgreSQL by default (or the free-account Azure server for 12 months);
  backups are the provider's; no retention jobs or restore drills yet (D38, B-37). Job rows and raw
  listings grow without cleanup.
- Observability is logs only: Log Analytics, 30-day retention, 0.2 GB/day cap (logging pauses for
  the rest of the day when hit); product events are log lines (D15, B-23); no Application Insights
  (B-31). Failed billing webhooks are visible only in logs and the Stripe dashboard.
- Deployment is manual (Azure CLI, two phases); no CI/CD, custom domains or private networking
  (B-31). Public endpoints are protected by identity, TLS and passwords, not network isolation.
- The migration image is 3.5 GB (B-31). Azure template uses PostgreSQL 17, local development 18.
- Unchanged open matches are re-analysed by the AI once a day - watch AI cost per Hunt (B-33).
- Internal ingestion diagnostics are development-only (404 in production); there is no staff /
  admin role (B-34).
- No OpenAPI document yet (B-30) - the typed api-client is the contract for web and mobile.
- Integration tests share the development database; the hunt-activity test can flake while a local
  worker runs (B-35). The acceptance sequence is manual (B-35).
- Remaining dependency advisories are in build tooling only (docs/security/hardening-2026-10.md).
