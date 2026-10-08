# Mascot assets still needed

_Last updated: 2026-10-08, step 36 (Build Prompt 33)._

The product asks for mascots by **semantic token** (`MascotToken` and `PRODUCT_STATE_MASCOTS` in
`packages/design-tokens/src/mascot.ts`), never by file name. Each app maps a token to an approved
file in `packages/brand-assets` (`apps/web/src/brand/assets.ts`, `apps/mobile/src/brand/assets.ts`).

When a token has **no approved file**, the `MascotSlot` component shows a **neutral placeholder**: a
dashed soft circle with a plain system icon (not mascot art). On web it carries
`data-asset-todo="<token>"`; on mobile `testID="asset-todo-<token>"`. Nothing is generated or
invented to fill the gap (Mascot Usage Guide section 11: one need, one asset, approved first).

## Approved and in use

| Token | Pose | File |
|---|---|---|
| `welcome` | Wave / happy | `mascot/mascot-wave.png` |
| `confirmed` | Thumbs up | `mascot/mascot-thumbs-up.png` |
| `inventory` | Holding / carrying box | `mascot/mascot-holding-box.png` |

## Needed (placeholder showing today)

Pose and meaning are quoted from the Mascot Usage Guide v1.0 (sections 4 and 10). Generate each as
one transparent, high-resolution production asset, get it approved, save it as
`packages/brand-assets/mascot/mascot-<pose>.png`, map the token in both `brand/assets.ts` files
and move the row up. No code change is needed beyond the two maps.

| Token | Pose (guide) | Meaning (guide) | Where Rein Drop shows it now | Placeholder icon |
|---|---|---|---|---|
| `working` | Loading / working | Rein Drop is actively doing work | Hunt's first scan (Hunt detail, Deals before the first deal) | rotating arrows (still under reduced motion) |
| `waiting` | Sitting / leaning on box | Calm waiting; no fresh matches yet while monitoring stays healthy | "Watching - nothing has matched yet" (Hunt detail, Deals) | hourglass |
| `afterHours` | Sleeping / resting | After-hours / intentionally quiet | Reduced-monitoring state (Home) - shown only once quiet hours / plan cadence exist (D22, D7); visible in the dev gallery | moon |
| `suggestion` | Looking / thinking | Suggestion / recommendation | Home recommendation (setup / suggestion kinds), plan-limit suggestion (Hunts list), Analytics recommendation | lightbulb |
| `cancellation` | Sad / empty | Plan cancellation; empathy without guilt-tripping | Cancel plan placeholder flow (Settings) | crossed circle |
| `profit` | Success / profit | Money was actually made | Reserved for Sale Result (realized profit only) - still renders nothing there (step 32), switch to `MascotSlot` when approved | trending-up |
| `success` | Celebrating | Major success | Not shown yet | party popper |
| `exceptionalDeal` | Surprised / exclamation | Rare, unusually strong opportunity | Exceptional-deal banner (Deal detail) - still renders nothing there (step 26) | sparkles |
| `analysis` | Inspecting / magnifier | Analysis / investigation | Not shown yet | magnifier |

Unmapped files in `packages/brand-assets/mascot/` (`mascot-delivery-dash.png`,
`mascot-running-box.png`) are approved art without a token yet; the guide reserves running for
speed / urgency (e.g. Hot Hunt) - use sparingly, only when that feature exists.

## Rules kept by the code

- Product code never imports mascot files; it uses `MascotSlot token=...` or a product state.
- Placeholders are decorative (hidden from screen readers); the text always carries the meaning.
- No mascot in dense analytics; the thinking / idea mascot only in recommendation areas.
- `profit` / `success` only for a genuine realized result; never for estimates.
