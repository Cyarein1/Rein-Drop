# Mascot assets - register

_Last updated: 2026-10-14, step 72 - every mascot token now has approved art. Reference only, not
a to-do list (renamed from `ASSET_TODO.md` in step 72). Open work lives in
[OUTSTANDING.md](OUTSTANDING.md)._

The product asks for mascots by **semantic token** (`MascotToken` and `PRODUCT_STATE_MASCOTS` in
`packages/design-tokens/src/mascot.ts`), never by file name. Each app maps a token to an approved
file in `packages/brand-assets` (`apps/web/src/brand/assets.ts`, `apps/mobile/src/brand/assets.ts`).

If a token ever has **no approved file** again (a new token, or art withdrawn), the `MascotSlot`
component shows a **neutral placeholder**: a dashed soft circle with a plain system icon (not
mascot art). On web it carries `data-asset-todo="<token>"`; on mobile `testID="asset-todo-<token>"`.
Nothing is generated or invented to fill a gap (Mascot Usage Guide section 11: one need, one asset,
approved first).

## Approved and in use

The 2026-10-14 poses were created by the owner and supplied in `Downloads/ReinDrop/branding assets`.
They're copied byte-identical (transparent PNG, checked on white: no halo, no baked-in background).

| Token | Pose | File | Supplied | Where Rein Drop shows it |
|---|---|---|---|---|
| `welcome` | Wave / happy | `mascot/mascot-wave.png` | 2026-10-07 | Onboarding welcome, "No Hunts yet" |
| `confirmed` | Thumbs up | `mascot/mascot-thumbs-up.png` | 2026-10-07 | Onboarding done, confirmations |
| `inventory` | Holding / carrying box | `mascot/mascot-holding-box.png` | 2026-10-07 | Empty inventory |
| `working` | Working (typing on a laptop on a box) | `mascot/mascot-working.png` | 2026-10-14 | Hunt's first scan (Hunt detail, Deals before the first deal) |
| `waiting` | Leaning on a box | `mascot/mascot-leaning-box.png` | 2026-10-14 | "Watching - nothing has matched yet" (Hunt detail, Deals) |
| `afterHours` | Sleeping on a box | `mascot/mascot-sleeping.png` | 2026-10-14 | Reduced-monitoring state (Home) - shown once quiet hours / plan cadence exist (D22, D7); visible in the dev gallery |
| `suggestion` | Thinking (question mark) | `mascot/mascot-thinking.png` | 2026-10-14 | Home recommendation (setup / suggestion), plan-limit suggestion (Hunts list), Analytics recommendation |
| `cancellation` | Sad, sitting on a box | `mascot/mascot-sad.png` | 2026-10-14 | Cancel plan flow (Settings) |
| `profit` | Profit (cash, coins, rising chart) | `mascot/mascot-profit.png` | 2026-10-14 | Sale Result - **only** when the sale realized a gain (`celebrate`) |
| `success` | Celebrating (confetti) | `mascot/mascot-celebrating.png` | 2026-10-14 | Not shown in the app yet (no "major success" moment exists) |
| `exceptionalDeal` | Surprised (exclamation) | `mascot/mascot-surprised.png` | 2026-10-14 | Exceptional-deal banner (Deal detail, web + mobile) |
| `analysis` | Inspecting with a magnifier | `mascot/mascot-magnifier.png` | 2026-10-14 | Not shown in the app yet |

Unmapped files in `packages/brand-assets/mascot/` (`mascot-delivery-dash.png`,
`mascot-running-box.png`) are approved art without a token; the guide reserves running for
speed / urgency (e.g. Hot Hunt) - use sparingly, only when that feature exists. Both are used on the
landing page (docs/LANDING_ASSETS.md).

## Related open points (tracked in OUTSTANDING.md)

- **Landing:** two landing poses have no art: phone / notification (Alerts) and planning /
  checklist (Create a Hunt) - docs/LANDING_ASSETS.md.
- **Currency:** the `profit` pose shows dollar signs. The app is locale-driven (ZAR users see R),
  so a currency-neutral variant may be wanted - owner's call.
- **Mobile sizes:** the originals are 0.7-1.9 MB each and are bundled as-is. Export optimized
  @1x/@2x/@3x PNGs before a store build (post-MVP backlog B-25).

## Rules kept by the code

- Product code never imports mascot files; it uses `MascotSlot token=...` or a product state.
- Mascots are decorative (hidden from screen readers); the text always carries the meaning.
- No mascot in dense analytics, on every card / row, or instead of the normal loading UI; the
  thinking mascot only in recommendation areas.
- `profit` / `success` only for a genuine realized result; never for estimates (and never on the
  landing's illustrative numbers).
