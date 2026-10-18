// Generates the web's optimized brand images from the approved originals in
// packages/brand-assets (the source of truth - never edit the outputs by hand).
//
//   pnpm --filter web assets:brand
//
// Outputs (committed, stable URLs):
//   public/assets/brand/**                       trimmed WebP (+ PNG icons) at web sizes
//   src/marketing/brand-assets.generated.ts      paths + intrinsic sizes for next/image
// Mapping to landing uses: src/marketing/landing-assets.ts, register: docs/LANDING_ASSETS.md.
import { createRequire } from "node:module";
import { mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(webRoot, "../../packages/brand-assets");
const outRoot = path.join(webRoot, "public/assets/brand");
// sharp ships with Next.js (its image optimizer); resolve it from there instead of adding a dependency.
const sharp = createRequire(realpathSync(path.join(webRoot, "node_modules/next/package.json")))("sharp");

/** Transparent padding kept around trimmed art so glows and splashes aren't cut (fraction of size). */
const PAD = 0.02;

/** key -> source file, output kind and size. Only approved originals; concept sheets are never listed. */
const ASSETS = [
  // Mascot poses (transparent). Longest side 1024 px = 2x a ~512 px CSS hero slot.
  { key: "mascot/wave", source: "mascot/mascot-wave.png", maxSide: 1024 },
  { key: "mascot/thumbs-up", source: "mascot/mascot-thumbs-up.png", maxSide: 1024 },
  { key: "mascot/holding-box", source: "mascot/mascot-holding-box.png", maxSide: 1024 },
  { key: "mascot/running-box", source: "mascot/mascot-running-box.png", maxSide: 1024 },
  { key: "mascot/delivery-dash", source: "mascot/mascot-delivery-dash.png", maxSide: 1024 },
  // Poses with a landing use (landing-assets.ts) - registered, not placed in a section yet.
  { key: "mascot/thinking", source: "mascot/mascot-thinking.png", maxSide: 1024 },
  { key: "mascot/magnifier", source: "mascot/mascot-magnifier.png", maxSide: 1024 },
  { key: "mascot/surprised", source: "mascot/mascot-surprised.png", maxSide: 1024 },
  { key: "mascot/celebrating", source: "mascot/mascot-celebrating.png", maxSide: 1024 },
  // Wordmarks / lock-ups (transparent). The originals carry ~25% empty canvas - trimmed here so a
  // given CSS height shows the full logo.
  { key: "logo/wordmark-navy", source: "logo/wordmark-navy.png", height: 192 },
  { key: "logo/wordmark-white", source: "logo/wordmark-white.png", height: 192 },
  { key: "logo/wordmark-3d", source: "logo/wordmark-3d.png", height: 192 },
  { key: "logo/lockup-horizontal", source: "logo/logo-mascot-horizontal.png", maxSide: 1200 },
  { key: "logo/lockup-hero-dark", source: "logo/logo-mascot-hero-dark.png", maxSide: 1024 },
  // App icon (owner, 2026-10-18: package + magnifier on flat Rein Orange). WebP for the page, PNG
  // sizes for browser / home-screen icons. The rounded tile for favicons and the page; the
  // full-bleed square where the OS rounds it (apple-touch-icon) or a square logo is expected.
  { key: "icon/app-icon", source: "app-icon/app-icon-package-search.png", maxSide: 512 },
  { key: "icon/app-icon-512", source: "app-icon/app-icon-package-search-square.png", square: 512, format: "png" },
  { key: "icon/app-icon-192", source: "app-icon/app-icon-package-search.png", square: 192, format: "png" },
  { key: "icon/favicon-48", source: "app-icon/app-icon-package-search.png", square: 48, format: "png" },
  { key: "icon/apple-touch-icon", source: "app-icon/app-icon-package-search-square.png", square: 180, format: "png" },
];

async function build(asset) {
  const input = path.join(sourceRoot, asset.source);
  let image = sharp(input, { failOn: "error" });
  if (!asset.square) {
    // Trim transparent edges, then add back a small transparent margin.
    const trimmed = await image.trim().toBuffer({ resolveWithObject: true });
    const pad = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * PAD);
    image = sharp(trimmed.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    image = sharp(await image.png().toBuffer());
  }
  if (asset.square) image = image.resize(asset.square, asset.square, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  else if (asset.height) image = image.resize({ height: asset.height, withoutEnlargement: true });
  else image = image.resize(asset.maxSide, asset.maxSide, { fit: "inside", withoutEnlargement: true });

  const format = asset.format ?? "webp";
  const file = path.join(outRoot, `${asset.key}.${format}`);
  mkdirSync(path.dirname(file), { recursive: true });
  const output =
    format === "png"
      ? image.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10, dither: 0.6 })
      : image.webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true });
  const info = await output.toFile(file);
  return {
    key: asset.key,
    src: `/assets/brand/${asset.key}.${format}`,
    width: info.width,
    height: info.height,
    bytes: statSync(file).size,
    source: `packages/brand-assets/${asset.source}`,
    sourceBytes: statSync(input).size,
  };
}

rmSync(outRoot, { recursive: true, force: true });
const results = [];
for (const asset of ASSETS) results.push(await build(asset));

const entries = results
  .map((r) => `  "${r.key}": { src: "${r.src}", width: ${r.width}, height: ${r.height}, bytes: ${r.bytes}, source: "${r.source}" },`)
  .join("\n");
writeFileSync(
  path.join(webRoot, "src/marketing/brand-assets.generated.ts"),
  `// GENERATED by scripts/build-brand-assets.mjs - do not edit. Run: pnpm --filter web assets:brand\n` +
    `// Optimized copies of the approved originals in packages/brand-assets (see docs/LANDING_ASSETS.md).\n` +
    `export const brandImages = {\n${entries}\n} as const;\n\nexport type BrandImageKey = keyof typeof brandImages;\nexport type BrandImage = (typeof brandImages)[BrandImageKey];\n`,
);

const kb = (n) => `${Math.round(n / 1024)} KB`;
for (const r of results) console.log(`${r.src.padEnd(44)} ${String(r.width).padStart(4)}x${String(r.height).padEnd(4)} ${kb(r.bytes).padStart(7)}  (from ${kb(r.sourceBytes)})`);
const total = results.reduce((s, r) => s + r.bytes, 0);
console.log(`total ${kb(total)} in ${results.length} files`);
