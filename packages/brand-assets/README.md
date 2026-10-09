# @rein-drop/brand-assets

The single home for **approved** Rein Drop brand image files. Web and mobile import from here;
nothing else in the repo should hold copies of logos or mascot art.

Governing documents: Brand Identity v2.1 and Mascot Usage Guide v1.0
(`docs/brand/`). Per the guide, the **first individually generated assets are the working
production set**; the large mascot sheets are concept/reference only and live in
`docs/brand/reference/` - never import those.

## Layout

```
logo/        wordmarks and lock-ups
app-icon/    square marks for app icons / compact brand contexts
mascot/      individual production mascot poses (transparent PNG)
```

| File | Source file (Downloads/ReinDrop/branding assets) | Intended use |
|---|---|---|
| `logo/wordmark-navy.png` | ReinDrop Navy Droplet Wordmark | Default wordmark on white/light surfaces |
| `logo/wordmark-white.png` | ReinDrop White Splash Logo | Wordmark on navy/dark surfaces only |
| `logo/wordmark-3d.png` | Glossy ReinDrop 3D Wordmark | Expressive/marketing moments (splash), not UI chrome |
| `logo/logo-mascot-horizontal.png` | ReinDrop Mascot Delivery Logo | Mascot + wordmark lock-up (welcome/splash) |
| `logo/logo-mascot-hero-dark.png` | Glossy ReinDrop Delivery Mascot Logo | Marketing hero; **has a dark glow baked in - not for light UI** |
| `app-icon/app-icon-mascot.png` | Cheerful Orange Mascot App Icon | Source for the mobile app icon (not wired yet) |
| `mascot/mascot-wave.png` | Glossy Orange Mascot Waving | `welcome` |
| `mascot/mascot-thumbs-up.png` | Cheerful Orange Mascot Thumbs-Up | `confirmed` |
| `mascot/mascot-holding-box.png` | Cheerful Orange Mascot Delivering a Package | `inventory` |
| `mascot/mascot-delivery-dash.png` | Cheerful Orange Mascot Delivery Dash | not mapped yet (running/urgency - use sparingly) |
| `mascot/mascot-running-box.png` | Joyful Orange Package Runner | not mapped yet (running/urgency - use sparingly) |

Note: the Brand Identity v2.1 says the logo is deferred and "use a simple wordmark during MVP" -
`wordmark-navy.png` is that wordmark. Lock-ups with the mascot are not the logo.

## Using assets in code

Product code never references file names directly. UI picks a **semantic mascot token**
(`MascotToken` in `@rein-drop/design-tokens`, e.g. `welcome`, `working`, `profit`), and each
app maps tokens to files in one place:

- web: `apps/web/src/brand/assets.ts` (static imports)
- mobile: `apps/mobile/src/brand/assets.ts` (`require`)

Tokens without an approved asset map to `null` and render nothing (no placeholder art).

## Adding or replacing an asset

1. Follow the Mascot Usage Guide's "one need -> one asset" rule: generate the single pose a real
   product state needs, transparent background, high resolution, and get it approved.
2. Save it here with a semantic, kebab-case name: `mascot/mascot-<pose>.png`
   (e.g. `mascot-working.png`, `mascot-thinking.png`).
3. Map the token in both app `brand/assets.ts` files. Replacing a file under the same name needs
   no code change.
4. Update the table above.

## Web derivatives (landing page)

`apps/web/public/assets/brand/` holds **generated**, optimized copies of these files (trimmed
WebP / palette PNG icons) for the landing page - `pnpm --filter web assets:brand`, register in
`docs/LANDING_ASSETS.md`. They are outputs, not sources: replace or add art **here**, then
re-run the script. They are the only copies allowed outside this package.

## TODO

- Optimized sizes: originals are 1-2 MB, ~1200-2000 px. Web: done for the landing page
  (derivatives above). Mobile: export @1x/@2x/@3x before shipping a release build.
- Wire `app-icon/app-icon-mascot.png` into `apps/mobile/app.json` (icon + adaptive icon) once the
  icon is confirmed for store use.
- SVG versions of the wordmarks, if available, would scale better than PNG.
