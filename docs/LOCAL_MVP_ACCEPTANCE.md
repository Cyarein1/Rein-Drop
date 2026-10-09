# Local MVP acceptance

An exact, manual walk through the whole MVP loop on one machine - from an empty database to a
sold item in Analytics - plus a source failure. Run it before a demo or a release candidate; tick
the sign-off table at the end. Takes about 20 minutes with the development sources.

Everything here is **local**: development sign-in, development marketplace sources, the mock AI
and the notification simulator, unless you switch a part to its real provider (see
[Configurations](#configurations)).

---

## 0. One-time setup

```powershell
pnpm install
pnpm build            # builds the shared packages the apps import
```

Docker Desktop must be running (PostgreSQL runs in Docker).

## 1. Reset to a clean demo database

```powershell
pnpm infra:up         # PostgreSQL in Docker (waits until it is healthy)
pnpm db:reset-demo    # drop everything, re-apply all migrations, seed
```

`db:reset-demo` (packages/db/prisma/reset-demo.ts):

- deletes **all data** in the configured database, re-applies every migration and seeds
  marketplaces, plans (Free / Pro / Ultimate) and the development user `dev@reindrop.local`;
- refuses `NODE_ENV=production`, and any database not on this machine unless `--allow-remote`;
- leaves the development user **without** Seller Snapshot answers, Hunts, deals, alerts,
  inventory, sales or a plan - the sequence below starts from there.

Stop the worker before resetting (it would keep writing during the reset). If Prisma asks for
confirmation because it detects an AI agent, run the command yourself.

Other helpers: `pnpm db:seed` (re-seed without deleting), `pnpm db:status` (migrations applied?),
`pnpm db:studio` (browse tables at http://localhost:5555), `pnpm infra:reset` (delete the Docker
volume - the database itself - then `pnpm infra:up` + `pnpm db:reset-demo`).

## 2. Start the stack

Three terminals, from the repository root:

```powershell
pnpm --filter api dev       # API     -> http://localhost:4000
pnpm --filter worker dev    # worker  (scheduler, searches, analysis, notifications)
pnpm --filter web dev       # web app -> http://localhost:3000
```

**Start (or restart) the worker right before step 6**: the development listings are aged from the
worker's start time, so a fresh start gives fresh "just listed" deals.

| Check | Expected |
|---|---|
| http://localhost:4000/health | `{"status":"ok",...}` |
| http://localhost:4000/ready | `{"status":"ready",...}` (database reachable) |
| http://localhost:3000/dev | "System status" shows the API live and ready |
| Worker terminal | `Worker started`; no config errors |

## 3. Sign in

Open http://localhost:3000/home. (http://localhost:3000 itself is the public landing page since step 49; with
Entra, a signed-in visitor there is sent to `/home`.)

- **Development (default, `AUTH_PROVIDER=dev`)**: you are signed in automatically as
  `dev@reindrop.local`. Settings -> Account shows the **Development sign-in** badge.
- **Entra External ID** (if configured): you land on **Sign in to Rein Drop** -> **Sign in with
  email** -> Microsoft's page -> sign in or create an account (email + password) -> back in the app.

**Expected:** because the Seller Snapshot isn't answered, the app sends you to setup (or open
http://localhost:3000/onboarding).

## 4. Seller Snapshot

1. "Are you a reseller?" -> **Yes**.
2. Answer the five questions (any options), **Next** after each.
3. Summary "You're set up" -> continue.

**Expected:** Home opens. Settings -> Seller Snapshot shows your five answers; **Edit answers** works.

## 5. Create a Hunt

Hunts -> **Create Hunt** (or http://localhost:3000/hunts/new):

| Field | Value |
|---|---|
| What are you hunting for? | `Nintendo Switch OLED` |
| Marketplaces | eBay **and** Facebook Marketplace |
| Location | `Cape Town` (Facebook needs a location) |
| Max price | `4000` (ZAR) |
| Everything else | leave as suggested |

**Review Hunt** -> check the summary sentence -> continue to **Start watching**.

## 6. Plan gate and activation

1. The plan gate lists **Free**, **Pro**, **Ultimate**, with Free recommended for one Hunt.
   - Development billing (`BILLING_PROVIDER=dev`, default): a "Development data" banner; paid
     plans show "Price TBD".
   - Stripe test mode (if configured): paid plans show Stripe's price.
2. **Choose Free** -> "Free - no card, no charge" -> **Choose Free and start watching**.

**Expected:** "Your Hunt is live". Hunts list shows it under Live; Settings -> Plan & billing
shows **Free**, "1 of 1 live Hunt in use".

(Optional paid path: in Stripe test mode choose **Pro** -> **Continue to secure checkout** -> pay
with `4242 4242 4242 4242` -> back on the page "Confirming your payment" -> the Hunt starts once
Stripe's webhook arrives; needs `stripe listen` - README "Billing locally with Stripe test mode".)

## 7. The worker searches both marketplaces

Within about a minute of activation (scheduler every 30 s, first search immediately):

| Where | Expected |
|---|---|
| Worker terminal | `Scheduled 2 hunt-marketplace(s)...`, then search jobs for `ebay` and `facebook` |
| Hunt detail (Hunts -> the Hunt) | "Last checked" for **eBay** and **Facebook Marketplace**, no failures |
| http://localhost:3000/dev/diagnostics | rows `ebay / dev` and `facebook / dev` (or the real providers), requests, listings returned, new listings |

## 8. Matches are analysed and an alert arrives

Within another minute:

| Where | Expected |
|---|---|
| Deals | Switch OLED deals from both marketplaces; the cheap "deal" and "just listed" ones near the top as **Strong**; over-budget listings are not there; a "for parts" listing shows its risk |
| Alerts (bell / http://localhost:3000/alerts) | at least one **new deal alert** for a Switch OLED under R 4 000 |
| http://localhost:3000/dev/notifications | the in-app delivery **SENT** and the push / email deliveries **SIMULATED** (nothing leaves the machine) |
| Worker terminal | `[simulated push] ...` lines |

Each match is alerted at most once; refreshing never creates duplicates.

## 9. Open the deal

From the alert (or Deals) open the deal.

**Expected:** title, price, marketplace, condition and risk notes, why it matched (your max
price passed), the AI explanation (mock provider: rule-based text), **View on eBay / Facebook
Marketplace**, and **Bought**, **Save**, **Ignore**. Opened from the Alerts inbox, the alert is marked read.

## 10. Mark Bought

**Bought** -> the purchase price defaults to the asking price -> optionally add a cost (e.g.
Shipping `100`) -> **Mark as bought**.

**Expected:** "Marked as bought. It's in your Inventory." -> **Open in Inventory**. The item is
**In stock** with purchase price + costs, and the expected values from the deal.

## 11. Mark Sold

Inventory -> the item -> **Mark sold** -> sale price higher than you paid (e.g. `4500`),
marketplace, sold today, optionally a selling fee -> **Mark sold**.

**Expected:** **Sale result**: realized profit = sale price - selling costs - purchase price -
purchase costs, shown in Profit Green when positive; expected vs actual beside it. The item moves
to Sold.

## 12. Realized P/L and Analytics

Analytics (http://localhost:3000/analytics):

| Section | Expected |
|---|---|
| Overview (30 days) | 1 buy, 1 sell, spent = purchase + costs, revenue = sale price, **realized profit** and margin matching the Sale result |
| Hunts | the Switch Hunt: found -> alerted -> viewed -> bought -> sold |
| Products / Marketplaces | the product and the marketplace you sold on |
| Missed potential | separate from profit; never counted as a loss |

Home shows the realized profit for the period too.

## 13. Pause and resume the Hunt

Hunts -> the Hunt -> **Pause**.

**Expected:** status **Paused**; the worker schedules no new searches for it (diagnostics: no new
runs); deals found so far stay. Then **Resume**: the go-live checks run again (Free: 1 live Hunt
allowed) and it is **Live**; a new search follows within about a minute. The Hunt's history lists
created, activated, paused, resumed.

## 14. Simulate a source failure

1. Stop the worker. In `apps/worker/.env` set:
   ```
   FACEBOOK_DEV_SCENARIO=unavailable
   ```
   (other scenarios: `degraded`, `slow`, `flaky`, `rate_limited`, `not_configured`,
   `invalid_response`, `malformed_payloads`, `empty`; the same for `EBAY_DEV_SCENARIO`.)
2. Start the worker again.

**Expected within 1-2 minutes:**

| Where | Expected |
|---|---|
| Home / Hunt detail | a calm **warning** banner: "Facebook Marketplace is having trouble right now" or "...isn't responding right now - Hunts can't search it until it is. eBay continues as normal." - never an error, and the Hunt is not shown as fully healthy |
| Hunt detail | Facebook marked as having trouble / not responding; eBay checked normally |
| Diagnostics | failed `facebook` runs; `ebay` runs keep succeeding |
| Worker terminal | Facebook searches deferred during the cool-down (backoff), eBay unaffected |

3. Remove the line, restart the worker: within a minute or two Facebook is healthy again and the
   banner disappears.

## 15. Finish

Sign-off below. To run again from scratch: stop the worker, `pnpm db:reset-demo`, start the worker.

---

## Configurations

The same sequence works with real providers - change only environment variables (untracked
`.env` files), restart, and expect the real provider's data instead of the development catalogue:

| Part | Development (default) | Real | Notes |
|---|---|---|---|
| eBay | `EBAY_SOURCE=dev` | `EBAY_SOURCE=api` + `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` (api + worker) | real eBay listings near the query (decision 0010) |
| Facebook | `FACEBOOK_SOURCE=dev` | `FACEBOOK_SOURCE=apify` + `APIFY_TOKEN`, `FACEBOOK_APIFY_CURRENCY` | development only; costs per run; raise `WORKER_JOB_LEASE_MS` |
| AI | `AI_PROVIDER=mock` | `AI_PROVIDER=foundry` + `FOUNDRY_*` (worker) | decision 0012 |
| Sign-in | `AUTH_PROVIDER=dev` | `AUTH_PROVIDER=entra` + `ENTRA_*` (api + web) | decision 0013 |
| Billing | `BILLING_PROVIDER=dev` | `BILLING_PROVIDER=stripe` + `STRIPE_*`, `WEB_APP_URL` (api) + `stripe listen` | decision 0014 |
| Notifications | `NOTIFICATION_DELIVERY=simulator`, `PUSH_PROVIDER=simulator` | `PUSH_PROVIDER=expo` with a development build | real push needs the mobile app (D23) |

With real sources, prices and counts differ: pick a Hunt query and max price that match current
listings near you.

## Troubleshooting

| Symptom | Check |
|---|---|
| "You're not signed in" | API running? `pnpm db:seed` (the development user)? |
| No searches after activation | worker running and no config errors; the Hunt is Live; `/dev/diagnostics` |
| Deals but no alert | max price set and above the listing; listing still active (restart the worker for fresh listings); `/dev/notifications`; alert rules are in decision 0005 |
| Facebook never searched | the Hunt needs a location |
| Plan gate says the limit is reached | Free allows 1 live Hunt: pause another one |
| `db:reset-demo` refuses | it only resets a local database outside production (`--allow-remote` for another host) |

## Sign-off

| # | Step | Pass | Notes |
|---|---|---|---|
| 1 | Reset + seed | | |
| 2 | Stack starts (health, ready, worker) | | |
| 3 | Sign in | | |
| 4 | Seller Snapshot | | |
| 5 | Create Hunt | | |
| 6 | Plan gate + activate | | |
| 7 | Worker searches eBay + Facebook | | |
| 8 | Match, analyse, alert | | |
| 9 | Open deal | | |
| 10 | Mark Bought | | |
| 11 | Mark Sold | | |
| 12 | Realized P/L + Analytics | | |
| 13 | Pause / resume | | |
| 14 | Source degradation + recovery | | |

Tester: ______  Date: ______  Configuration (dev / real parts): ______
