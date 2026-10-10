import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { photoCredits, productPhotos } from "./photos";

const publicDir = path.resolve(__dirname, "../../public");

/** Width / height from a WebP header (VP8X / VP8L / VP8). */
function webpSize(file: string) {
  const b = readFileSync(file);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
}

describe("example product photos", () => {
  it.each(Object.entries(productPhotos))("%s exists as an optimized WebP with the recorded size", (_key, photo) => {
    const file = path.join(publicDir, photo.src);
    expect(existsSync(file)).toBe(true);
    expect(photo.src).toMatch(/^\/assets\/photos\/[a-z0-9-]+\.webp$/);
    expect(webpSize(file)).toEqual({ width: photo.width, height: photo.height });
    expect(statSync(file).size).toBeLessThan(60 * 1024);
  });

  it("are credited to their Unsplash photographers", () => {
    expect(photoCredits).toHaveLength(Object.keys(productPhotos).length);
    for (const c of photoCredits) {
      expect(c.author.length).toBeGreaterThan(0);
      expect(c.profile).toMatch(/^https:\/\/unsplash\.com\/@[\w.-]+$/);
      expect(c.page).toMatch(/^https:\/\/unsplash\.com\/photos\/[\w-]+$/);
    }
  });

  it("describe informative photos as examples (decorative thumbnails have empty alt)", () => {
    for (const photo of Object.values(productPhotos)) {
      if (photo.alt) expect(photo.alt).toMatch(/^Example photo: /);
    }
    expect(productPhotos.iphone13Pro.alt).toMatch(/iPhone 13 Pro/);
    expect(productPhotos.playstation5.alt).toMatch(/PlayStation 5/);
  });
});
