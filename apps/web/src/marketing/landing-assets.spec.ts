import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brandImages } from "./brand-assets.generated";
import { landingImages, missingLandingImages } from "./landing-assets";

const webRoot = path.resolve(__dirname, "../..");
const publicFile = (src: string) => path.join(webRoot, "public", src);

/** Width / height from a WebP (VP8X / VP8L / VP8) or PNG header. */
function imageSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.toString("ascii", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

describe("brand images (generated)", () => {
  it.each(Object.entries(brandImages))("%s exists with the recorded size, from an approved original", (_key, image) => {
    const file = publicFile(image.src);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBe(image.bytes);
    expect(imageSize(file)).toEqual({ width: image.width, height: image.height });
    expect(image.source).toMatch(/^packages\/brand-assets\/(mascot|logo|app-icon)\//);
    expect(existsSync(path.resolve(webRoot, "../..", image.source))).toBe(true);
  });

  it("never uses concept sheets or the landing mockup", () => {
    for (const image of Object.values(brandImages)) expect(image.source).not.toMatch(/concept|reference|mockup|asset-pack|branding-kit/i);
  });

  it("keeps page images light (optimized copies, not the 1-2 MB originals)", () => {
    for (const image of Object.values(brandImages)) expect(image.bytes).toBeLessThan(150 * 1024);
  });
});

describe("landing image uses", () => {
  it("maps every mapped use to a generated image", () => {
    const generated = new Set(Object.values(brandImages));
    for (const [use, image] of Object.entries(landingImages)) if (image) expect(generated.has(image), use).toBe(true);
  });

  it("lists the poses still missing (neutral visuals until approved art exists)", () => {
    expect(missingLandingImages).toEqual(["alertMascot", "planningMascot"]);
  });
});
