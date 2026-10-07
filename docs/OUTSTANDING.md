# Outstanding work - the running "still to do" trail

_Last updated: 2026-10-07, after step 26 (Build Prompt 23)._

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
| D12 | Real eBay data source and terms; Facebook data provider | Step 18 | Development sources only (prompts 34-35) |
| D13 | Comparable-sales / resale price source | Step 22 | None - no estimates are made |
| D14 | Push and email providers | Step 4 | None (prompts 24-25) |
| D15 | Product analytics vendor (PostHog candidate) and which metrics | Step 4 | None (prompt 43) |
| D16 | Seller profile location / budget preferences | Step 3 | Not stored |
| D17 | Inventory quantity / lots | Step 3 | One row per physical item |
| D18 | Whether "Save" and "Watch" are one action; what marks a deal "Missed" (Blueprint section 22) | Docs review | Save = watch (one action, step 25); "Missed" not built |
| D19 | Feed ranking: freshness bonus size and how fast it fades | Step 25 | Up to 14 points, fading over 72 hours (never lifts a deal over a stronger band) |
| D20 | Ignore reasons: free text, or a fixed list of choices? | Step 25 | Optional free text (200 chars) |

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
- Hunt detail / edit / pause / archive / restore screens (API exists; list cards aren't links) -
  steps 15, 17; prompt 26.
- Editing a hunt doesn't re-evaluate existing matches immediately, and a LIVE edit doesn't reset
  the next poll - steps 20, 21.
- Geocoding with Azure Maps (decision 0001): location is free text; distance is never verified
  for sources that can't filter by radius - steps 13, 14, 21.

### Monitoring worker
- Listing refresh job (via `fetchListing`): sold / removed listings and listings filtered out by a
  narrowed hunt keep their matches NEW instead of becoming unavailable - step 21.
- Job retention (SUCCEEDED / DEAD rows grow forever) and lease renewal - step 20.
- Development listings re-age every time the worker restarts - step 20.
- Real marketplace adapters (D12) - step 18; prompts 34-35.
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
- Undo / edit a purchase made with Bought (price, date, costs) - step 25; prompt 28.
- Listing images on deal cards / detail (dev image URLs are fake; real image hosts need allowlisting) - step 26.
- The AI explanation doesn't receive comparables, so with an estimate it can contradict the economics ("estimated in a later step") - step 26 (with D13).
- Creating alerts (next, prompt 24): once per match, preferences, channels, per-hunt caps, in-app inbox / local
  simulator - step 24; prompt 24.
- Expo push notifications - prompt 25.
- Exceptional-deal mascot asset (only if approved artwork exists) - prompt 23.

### Plans and billing
- Real checkout (D2) - step 17; prompt 39.
- Downgrade must never delete Hunts - docs review.

### Outcomes and analytics
- Bought -> Inventory -> Sold backend with realized P/L, expected vs actual - prompt 28.
- Inventory and sale screens - prompt 29.
- Analytics backend and screens (missed potential kept apart from P/L) - prompts 30-31.
- Home dashboard with real data (profit / bought / sold counts) - step 5; prompt 27.

### Platform and API
- OpenAPI spec (Tech Architecture locks "REST + OpenAPI") - docs review.
- CORS policy (only needed once a browser calls the API directly) - step 10.
- UI translations (only English exists) - step 14.
- App-store storefront country to refine mobile locale detection - step 14.
- Source health / degraded states, empty / waiting / after-hours states - prompts 32-33.
- Production hardening, Azure deployment, beta telemetry, MVP freeze - prompts 40-44.
- Local MVP acceptance script + one-command reset / seed - prompt 41.

### Brand and assets
- Confirm font sizes, spacing and neutral greys in the high-fidelity design pass - step 6.
- Optimised @1x/@2x/@3x mascot PNGs for mobile (originals are 1-2 MB) - step 6.
- App icon + splash still Expo defaults; brand icon awaits store approval - step 9.
- SVG wordmarks, if available - step 6.
- Mobile tab bar has no orange active indicator like web - step 9.

## 3. Built but not yet verified by a person

- **Mobile on a real device / emulator**: shell (step 9), Create Hunt (step 15), plan gate
  (step 17), onboarding (step 23), Deals feed + detail (step 26). Only typecheck / lint / bundle builds have been run.
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

24 Notifications + local simulator -
25 Expo push - 26 Hunts management screens - 27 Home dashboard - 28 Bought / Inventory / Sold
backend - 29 Inventory and sale UI - 30 Analytics backend - 31 Analytics UI - 32 Source health and
degraded UX - 33 Empty / waiting / after-hours / recommendation states - 34 Real eBay adapter -
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
| Worker could overwrite a user's decision made while a search was running | Step 25 (found) | Step 25 |
