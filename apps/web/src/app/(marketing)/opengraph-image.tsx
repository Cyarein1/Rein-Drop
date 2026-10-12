import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { colors, neutral, wash } from "@rein-drop/design-tokens";
import { SOCIAL_IMAGE_ALT } from "@/marketing/seo";

/**
 * The social sharing image for the public pages (Landing 22): approved brand art only - the navy
 * wordmark and the holding-box mascot from @rein-drop/brand-assets - with the hero's own words.
 * No numbers, results, marketplaces, dates or promises. Generated once at build time.
 */
export const alt = SOCIAL_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const brand = (file: string) => readFile(join(process.cwd(), "node_modules/@rein-drop/brand-assets", file)).then((b) => `data:image/png;base64,${b.toString("base64")}`);

/**
 * Cache Components: file reads would make this route render per request (and need the art at
 * runtime). Cached, the image is prerendered at build like other metadata files.
 */
async function brandArt() {
  "use cache";
  cacheLife("max");
  const [wordmark, mascot] = await Promise.all([brand("logo/wordmark-navy.png"), brand("mascot/mascot-holding-box.png")]);
  return { wordmark, mascot };
}

/** Inter (the brand typeface) as TTF - the image renderer can't read the site's WOFF2 files. */
const inter = (file: string) => readFile(join(process.cwd(), "node_modules/@expo-google-fonts/inter", file)).then((b) => b.toString("base64"));

/** Cached as base64 text (serializable); turned back into the ArrayBuffers the renderer needs below. */
async function brandFonts() {
  "use cache";
  cacheLife("max");
  const [extraBold, medium] = await Promise.all([inter("800ExtraBold/Inter_800ExtraBold.ttf"), inter("500Medium/Inter_500Medium.ttf")]);
  return { extraBold, medium };
}

const arrayBuffer = (base64: string) => {
  const b = Buffer.from(base64, "base64");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

export default async function OpenGraphImage() {
  const [{ wordmark, mascot }, cachedFonts] = await Promise.all([brandArt(), brandFonts()]);
  const fonts = { extraBold: arrayBuffer(cachedFonts.extraBold), medium: arrayBuffer(cachedFonts.medium) };
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `linear-gradient(135deg, ${colors.canvas} 0%, ${wash.sky} 100%)`,
          color: colors.navy,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 640 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
          <img src={wordmark} width={300} height={120} alt="" />
          <div style={{ display: "flex", flexDirection: "column", fontSize: 88, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
            <span>You flip it.</span>
            <span style={{ display: "flex" }}>
              We&nbsp;<span style={{ backgroundColor: "rgba(255, 107, 53, 0.32)" /* the hero highlighter */, padding: "0 6px" }}>find it.</span>
            </span>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: neutral.textMuted, lineHeight: 1.35 }}>A sourcing assistant for resellers.</div>
          <div style={{ display: "flex" }}>
            <span style={{ padding: "8px 18px", borderRadius: 999, backgroundColor: wash.yellow, fontSize: 24, fontWeight: 800 }}>Early access</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
        <img src={mascot} width={430} height={414} alt="" />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: fonts.extraBold, weight: 800, style: "normal" },
        { name: "Inter", data: fonts.medium, weight: 500, style: "normal" },
      ],
    },
  );
}
