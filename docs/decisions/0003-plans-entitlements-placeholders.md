# 0003 - Plans and entitlements: model now, final limits and prices later

- **Status:** Accepted (2026-10-07). Limits are **placeholders**; prices are **not modelled**.

## Decision

- Plans **Free, Pro, Ultimate** (names from the Mobile UI Screenbook) are seeded in every
  environment. Users without an active subscription are on **Free**.
- Entitlements per plan (rows in `Entitlement`, keys in `@rein-drop/contracts` `ENTITLEMENT_KEYS`):
  active-Hunt allowance, marketplace access, Hot Hunt availability + allowance (future flag, off
  everywhere), monitoring priority (NORMAL only), analytics/history days, seats.
- **All numeric limits are placeholders** chosen only so enforcement can be built and tested. Every
  plan reports `limitsFinal: false` through the API. **No prices** exist anywhere
  (`pricing: { status: 'tbd' }` for paid plans).
- Enforcement: going LIVE (activate / resume) and editing a LIVE hunt are checked against the
  plan. A blocked activation leaves the hunt unchanged (drafts stay drafts) and returns
  `409 ACTIVATION_BLOCKED` with structured reasons and resolutions
  (Blueprint section 14: "Pause another Hunt or upgrade").

## Placeholder values (edit in `packages/db/prisma/seed.ts`, `PLAN_CATALOGUE`)

| | Free | Pro | Ultimate |
|---|---|---|---|
| Live hunts | 1 | 10 | 25 |
| Marketplaces | eBay, Facebook | eBay, Facebook | eBay, Facebook |
| Hot Hunts | not available | not available | not available |
| Monitoring priority | Normal | Normal | Normal |
| Analytics history | 30 days | full | full |
| Seats | 1 | 1 | 3 |

## When the cost model is ready

1. Update `PLAN_CATALOGUE` with the real limits (and marketplace access per plan if it differs).
2. Set `limitsFinal: true` for finalised plans; run `pnpm db:seed` (it makes each plan's
   entitlements exactly match the catalogue).
3. Prices belong with the billing provider decision (Stripe leading candidate) - separate step.
