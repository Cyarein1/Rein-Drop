# Outstanding work - the running "still to do" trail

_Last updated: 2026-10-08, after step 37 (Build Prompt 34)._

Everything that has been left open since step 1, in one place. Updated at the end of every step,
together with `docs/BUILD_STATUS.md`. Rules:

- New open items are added with the step they came from.
- Finished items are not deleted: they move to **Resolved** at the bottom with the step that did
  them, so the trail stays complete.
- "Step N" = our step numbers in BUILD_STATUS; "Prompt N" = the Vibe Coding Build Prompts document.

## 1. Decisions needed from you

These block or shape work; the code uses placeholders until you decide.

| # | Decision | Raised | Placeholder in use |
|---|---|---|---|
| D1 | Managed auth provider (sign-in, sign-out, accounts) | Step 7 | Development-only auth (`x-dev-auth-subject`) |
| D2 | Billing provider (Stripe is the leading candidate) and mobile store billing | Step 16 | Fake development checkout, 404 in production |
| D3 | Plan prices and limits (Free / Pro / Ultimate) | Step 16 | "Price TBD"; placeholder limits in the seed |
| D4 | What non-resellers get after answering "no" | Step 12 | "Coming soon" screen |
| D5 | Seller Snapshot question 4 wording / options per category (Blueprint section 22) | Step 8 | Blueprint wording |
| D6 | Facebook needs a location to go live - confirm | Step 13 | Required |
| D7 | Hunt poll interval per plan / priority (cost model) | Step 20 | 15 min in development; must be set in production |
| D8 | What counts as Strong vs Exceptional; how many comparable sales are trustworthy (Blueprint section 22) | Step 24 | Exceptional = 2x target; 5 sales minimum (decision 0005) |
| D9 | Margin definition: upside / resale price, or return on cost | Step 24 | Upside / resale price |
| D10 | How old a listing may be and still alert | Step 24 | 48 hours |
| D11 | Hunts with no max price and no target: should they ever alert before resale data exists? | Step 24 | No (feed only) |
| D12 | Real eBay data source and terms; Facebook data provider | Step 18 | eBay: Browse API built (decision 0010) - confirm licence / production keyset / quota; Facebook: development source only (prompt 35) |
| D13 | Comparable-sales / resale price source | Step 22 | None - no estimates are made |
| D14 | Push and email providers | Step 4 | None (prompts 24-25) |
| D15 | Product analytics vendor (PostHog candidate) and which metrics | Step 4 | None (prompt 43) |
| D16 | Seller profile location / budget preferences | Step 3 | Not stored |
| D17 | Inventory quantity / lots | Step 3 | One row per physical item |
| D18 | Whether "Save" and "Watch" are one action; what marks a deal "Missed" (Blueprint section 22) | Docs review | Save = watch (one action, step 25); "Missed" not built |
| D19 | Feed ranking: freshness bonus size and how fast it fades | Step 25 | Up to 14 points, fading over 72 hours (never lifts a deal over a stronger band) |
| D21 | Notification defaults (push on / email off for alerts; weekly insight + marketing opt-in) | Step 27 | Decision 0006 table |
| D22 | Quiet hours, per-Hunt caps / digests, and whether a later "exceptional" score should alert again | Step 27 | None; one alert per deal, never upgraded |
| D23 | Expo / EAS account for a development build (needed to receive real pushes) | Step 28 | Expo Go + simulated development tokens |
| D24 | Home "current period" for realized profit: rolling 30 days, calendar month, or user-chosen? | Step 30 | Rolling 30 days |
| D25 | Home recommendation thresholds (3 failed checks, 24h with no deals, 20 to review with no alerts) | Step 30 | As listed |
| D20 | Ignore reasons: free text, or a fixed list of choices? | Step 25 | Optional free text (200 chars) |
| D26 | Margin % on a sale: profit / sale price (and return % = profit / cost basis) - confirm both are wanted | Step 31 | Both shown (decision 0007) |
| D27 | Multi-currency reselling (buy in USD, sell in ZAR): convert with FX, or keep "result unavailable"? | Step 31 | Unavailable, never converted |
| D28 | What counts as "missed": which strengths, and do deals you ignored count? (Blueprint section 22 also open) | Step 33 | Strong / exceptional, never bought, ignored or gone (decision 0008) |
| D29 | Hunt funnel: activity in the period (each event by its date) or a cohort of deals found in the period? | Step 33 | Activity (so "alerts bought" over 100% is hidden - step 34) |
| D31 | Source health thresholds: slow > 5 s, down after 3 failures, cool-down 30 s doubling to 15 min, search timeout 30 s | Step 35 | As listed (decision 0009) |
| D30 | Analytics recommendation thresholds (held 30+ days, 60% ignored with 5+ viewed, 3 missed) and their order | Step 34 | As listed (`ANALYTICS_RECOMMENDATION_RULES`) |

## 2. Not built yet (by area)

### Accounts and auth
- Welcome + create-account / sign-in screens (Screenbook frames 01-02) - step 23, prompt 38.
- Sign-out (web + mobile) - step 7, prompt 38.
- Signed-out visitors on `/` should go to welcome / sign-in - step 10.
- Web production mode can't sign in until D1 - step 10.
- Mobile session check only tests liveness, not `/ready` - step 2.

### Onboarding
- Non-reseller experience (D4) - step 12.

### Hunts
- Hot Hunt (paid priority) purchase flow - deliberately not built yet (prompt 26); priority shows as Normal - step 29.
- Per-period Hunt performance (counts are all-time today) - step 29; prompts 30-31.
- Editing a hunt doesn't re-evaluate existing matches immediately, and a LIVE edit doesn't reset
  the next poll - steps 20, 21.
- Geocoding with Azure Maps (decision 0001): location is free text; distance is never verified
  for sources that can't filter by radius - steps 13, 14, 21.

### Monitoring worker
- Listing refresh job (via `fetchListing`): sold / removed listings and listings filtered out by a
  narrowed hunt keep their matches NEW instead of becoming unavailable - step 21.
- Job retention (SUCCEEDED / DEAD rows grow forever) and lease renewal - step 20.
- Development listings re-age every time the worker restarts - step 20.
- Real Facebook data provider (D12) - step 18; prompt 35.
- eBay live tests are skipped until eBay credentials are configured (set EBAY_CLIENT_ID / EBAY_CLIENT_SECRET to run them) - step 37.
- eBay Browse quota: one page of up to 200 results per Hunt check - size it with prompt 36 - step 37.
- Ingestion economics, latency and cost per request - docs review; prompt 36.

### Matching, analysis, scoring
- Relevance is lexical (synonyms only via the AI); stopwords English only - step 21.
- Foundry AIProvider (models per task, credentials) - step 22; prompt 37.
- Mock AI text is English only - step 22.
- Seller facts and comparable sales as AI evidence (schemas only allow "not available") - step 22 (D13).
- Resale estimates / upside (needs D13); auctions are scored on their current bid - step 24.
- Changing an AI prompt version alone doesn't trigger re-analysis - step 24.
- Unchanged open matches are re-analysed once a day (watch cost once Foundry is used) - step 24.
- AI cost metadata and golden test datasets - docs review.

### Deals and alerts
- "Suppress similar noise" after Ignore (Blueprint section 10): reasons are stored, not used - step 25.
- Saved deals aren't specially refreshed when the source listing changes (Blueprint section 10) - step 25.
- Undo a Bought entirely (delete the item, reopen the deal) - step 25; editing it is done (step 31).
- Listing images on deal cards / detail (dev image URLs are fake; real image hosts need allowlisting) - step 26.
- The AI explanation doesn't receive comparables, so with an estimate it can contradict the economics ("estimated in a later step") - step 26 (with D13).
- Real push on a phone: EAS project id + development build (D23) - step 28.
- Expo push receipts (errors reported after the ticket), badge counts - step 28.
- Email provider for notifications - step 27 (D14).
- Operational alerts (source degraded long enough to matter) and the weekly insight are not generated - step 27; prompt 32.
- Exceptional-deal mascot asset (only if approved artwork exists) - prompt 23.
- Profit / success mascot asset for a realized-profit Sale Result (slot wired, shows nothing until
  approved art exists) - step 32.
- Thinking / idea mascot asset for the analytics recommendation (slot wired, nothing yet) - step 34.
- Missing mascot art (working, waiting, afterHours, suggestion, cancellation, profit, success, exceptionalDeal, analysis): neutral placeholders until approved - see docs/ASSET_TODO.md - step 36. Sale Result / exceptional-deal banner still to switch to MascotSlot.

### Plans and billing
- Real checkout (D2) - step 17; prompt 39.
- Downgrade must never delete Hunts - docs review.

### Outcomes and analytics
- Returns and write-offs (statuses exist, no endpoints) - step 31.
- Estimated upside doesn't subtract selling fees, so expected-vs-actual profit compares an
  estimate without fees to a result with fees - step 31 (with D13).
- Profit-over-time chart (needs time buckets from the API) - step 34.
- Home "spent" is purchase price only; Analytics "spent" includes purchase costs - align - step 33.
- Analytics aggregate live on every request (no caching) - revisit with real data volumes - step 33.
- Default sale / purchase day uses the rendering device's time zone; server and browser must agree
  until the user's time zone is known (with D24) - step 32.
- Mobile date fields are typed (YYYY-MM-DD + Today / Yesterday); a native picker needs a new
  dependency - step 32.

### Platform and API
- OpenAPI spec (Tech Architecture locks "REST + OpenAPI") - docs review.
- CORS policy (only needed once a browser calls the API directly) - step 10.
- UI translations (only English exists) - step 14.
- App-store storefront country to refine mobile locale detection - step 14.
- Reduced-monitoring state is a placeholder: the API always reports normal until quiet hours / plan cadence exist (D22, D7) - step 36.
- Cancellation flow is a placeholder (explains, keeps the plan; can't cancel) until billing exists (D2) - step 36.
- Hunt-activity integration test creates LIVE hunts a running worker could poll (it asserts a null next check) - step 36.
- Backoff has no jitter (fine for one local worker; add with several workers / real APIs) - step 35.
- Production hardening, Azure deployment, beta telemetry, MVP freeze - prompts 40-44.
- Local MVP acceptance script + one-command reset / seed - prompt 41.

### Brand and assets
- Confirm font sizes, spacing and neutral greys in the high-fidelity design pass - step 6.
- Optimised @1x/@2x/@3x mascot PNGs for mobile (originals are 1-2 MB) - step 6.
- App icon + splash still Expo defaults; brand icon awaits store approval - step 9. Web has no
  `favicon.ico` either (404 in the browser console) - step 32.
- SVG wordmarks, if available - step 6.
- Mobile tab bar has no orange active indicator like web - step 9.

## 3. Built but not yet verified by a person

- **Mobile on a real device / emulator**: shell (step 9), Create Hunt (step 15), plan gate
  (step 17), onboarding (step 23), Deals feed + detail (step 26), inbox + notification settings (step 27), push permission
  prompt + tap-to-open + real Expo push (step 28), Hunts list / detail / edit (step 29), Home (step 30),
  Inventory / Mark sold / Sale result (step 32), Analytics screens (step 34). Only typecheck / lint / bundle builds have been run.
- Web error page when the API is down - step 10.
- Visual polish of the UI primitives in a browser and on a phone - step 6.

## 4. Housekeeping

- Stale code comments (the work they mention is done):
  - `packages/marketplace-core/src/raw-listing.ts` says RawListing has no `provider` column (added in step 20).
  - `docs/BUILD_STATUS.md` known issue "Worker does not use the database yet" (it does since step 20).
- `pnpm-workspace.yaml` `minimumReleaseAgeExclude` list can be removed once those versions age.
- Peer-dependency warnings (`tsconfck` wants TS 5; `@types/react-dom` vs `@types/react`).
- Prisma 8 is an RC - stay on 7.10 until stable.
- Product documents live only in `Downloads/ReinDrop/` - consider copying them into `docs/product/`.
- Anyone who applied the step 10 / 13 migrations under their old names must rename the two
  `_prisma_migrations` rows (step 14).

## 5. Remaining Build Prompts (planned)

35 Facebook data provider - 36 Ingestion economics - 37 Microsoft Foundry - 38 Managed auth -
39 Real billing (web beta) - 40 Production hardening - 41 Local MVP acceptance script -
42 First Azure deployment - 43 Beta telemetry - 44 MVP freeze + post-MVP backlog.

## Resolved

| Item | Raised | Resolved |
|---|---|---|
| Seller Snapshot meant dashboard counts instead of the 5 onboarding questions | Step 5 | Step 8 |
| No API for `/me`, Seller Snapshot, Hunts | Step 5 | Steps 10-13 |
| Native mobile app had no navigation | Step 7 | Step 9 |
| Archived hunts couldn't be restored | Step 13 | Step 14 |
| Migration folders named in local time broke fresh-database replay | Step 13 | Step 14 |
| Plan-gate / payment UI missing; Start watching disabled | Steps 15-16 | Step 17 (development checkout) |
| Expo Go "status 500" (missing `@expo/metro-runtime`) | Step 17 | Fix after step 17 |
| Port 5432 conflict with the Windows PostgreSQL service | Step 2 | Known issues (service set to Manual) |
| RawListing had no `provider` column | Step 18 | Step 20 |
| Nothing called the marketplace sources; no ingestion | Steps 18-19 | Step 20 |
| Hunt matching missing | Step 20 | Step 21 |
| Turbo build / typecheck race on db and web | Step 21 | Step 22 |
| Onboarding screens (reseller gate + 5 questions) missing - Build Prompt 11 skipped | Step 15 | Step 23 |
| Nothing ran AI analyses after matching | Step 22 | Step 24 |
| No scoring / alert eligibility | Step 22 | Step 24 |
| Deals API: ranked feed, filters, detail, Save / Ignore / Bought | Step 5 | Step 25 |
| Deal analysis was opaque in the contract (`analysis.result: unknown`) | Steps 5, 22 | Step 25 |
| Stale "TODO(product): matching rules" comment in the API matching module | Step 21 | Step 25 |
| Deals feed + Deal Detail screens (web + mobile) | Step 5 | Step 26 |
| Alerts: preferences, one alert per eligible deal, deliveries, simulator, inbox | Step 24 | Step 27 |
| Expo push: PushProvider, device tokens, permission after first live Hunt | Step 27 | Step 28 |
| Stale "monitoring engine isn't built yet" note on the live screens | Step 17 | Step 28 |
| Hunt detail / edit / pause / archive / restore screens | Steps 15, 17 | Step 29 |
| Home dashboard with real data, in Blueprint priority order | Step 5 | Step 30 |
| Worker could overwrite a user's decision made while a search was running | Step 25 (found) | Step 25 |
| Bought -> Inventory -> Sold backend: purchase costs, holding, Mark Sold, realized P/L, expected vs actual | Step 5 | Step 31 |
| Edit a purchase made with Bought (price, date, costs) | Step 25 | Step 31 |
| Home: sales couldn't be recorded, so realized profit stayed empty | Step 30 | Step 31 (API), step 32 (screens) |
| Inventory and sale screens (Inventory, Mark sold, Sale result) on web + mobile | Step 5 | Step 32 |
| Bought form said "Sale and profit tracking come later" | Step 26 | Step 32 |
| Analytics placeholder said purchases and sales couldn't be logged | Step 5 | Step 32 |
| Analytics backend: period overview, Hunt funnel, products, marketplaces, missed potential (SQL aggregates) | Step 5 | Step 33 |
| Analytics module was a scaffold with "TODO(product): metrics to report" | Step 5 | Step 33 |
| Analytics screens: overview, Hunt funnel, products + loss review, missed potential, one recommendation | Step 5 | Step 34 |
| Analytics placeholder notice on web and mobile | Step 5 | Step 34 |
| Source health / degraded UX: MarketplaceHealth, per-source backoff, calm banners, Hunts never falsely healthy | Step 18 | Step 35 |
| Adapter `health()` was never called; slow / partial searches counted as clean successes | Step 18 | Step 35 |
| Browser check of the source banners | Step 35 | Step 36 |
| Product states: first scan, no deals yet while healthy, reduced monitoring, plan suggestion, cancellation placeholder; semantic mascot slots | Step 6 | Step 36 |
| "Working" / "waiting" / "thinking" mascot slots rendered nothing - now neutral placeholders tracked in ASSET_TODO.md | Steps 26-34 | Step 36 |
| Settings "Plan & billing" said plans weren't decided - now shows the plan and live-Hunt use | Step 16 | Step 36 |
| Deals integration test hunts could be polled by a running worker | Step 25 | Step 36 |
| Real eBay adapter (Browse API, OAuth, rate / error handling, pagination, normalization) with mock mode kept | Step 18 | Step 37 |
| Development sources had no latency simulation | Step 19 | Step 35 |
