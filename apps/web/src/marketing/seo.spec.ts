import { describe, expect, it } from "vitest";
import { FAQ } from "./faq/faq";
import { jsonLdScript, LANDING_DESCRIPTION, LANDING_TITLE, landingMetadata, landingStructuredData, NON_PUBLIC_PATHS, robotsRules, siteUrl, sitemapEntries, SOCIAL_IMAGE_ALT } from "./seo";

const SITE = new URL("https://reindrop.example");

describe("site URL", () => {
  it("accepts an https origin only (http just for localhost); anything else is 'not configured'", () => {
    expect(siteUrl({ SITE_URL: "https://reindrop.example" })?.toString()).toBe("https://reindrop.example/");
    expect(siteUrl({ SITE_URL: " https://reindrop.example/ " })?.origin).toBe("https://reindrop.example");
    expect(siteUrl({ SITE_URL: "http://localhost:3100" })?.origin).toBe("http://localhost:3100");
    for (const bad of [undefined, "", "reindrop.example", "http://reindrop.example", "https://reindrop.example/landing", "https://reindrop.example/?x=1", "ftp://reindrop.example"]) {
      expect(siteUrl({ SITE_URL: bad }), String(bad)).toBeNull();
    }
  });
});

describe("without a public origin (preview / beta)", () => {
  it("nothing is guessed: noindex, no canonical, robots blocks all, empty sitemap, no structured data", () => {
    const meta = landingMetadata(null);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).not.toHaveProperty("url");
    expect(robotsRules(null)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(sitemapEntries(null)).toEqual([]);
    expect(landingStructuredData(null)).toBeNull();
  });
});

describe("with SITE_URL", () => {
  it("landing metadata: title, description, canonical, Open Graph, Twitter card; indexable", () => {
    const meta = landingMetadata(SITE);
    expect(meta.title).toEqual({ absolute: LANDING_TITLE });
    expect(meta.description).toBe(LANDING_DESCRIPTION);
    expect(meta.alternates).toEqual({ canonical: "/" });
    expect(meta.openGraph).toMatchObject({ type: "website", siteName: "Rein Drop", title: LANDING_TITLE, url: "/" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(meta.robots).toBeUndefined();
    expect(LANDING_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("robots: the public pages only, with the sitemap", () => {
    const r = robotsRules(SITE);
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: [...NON_PUBLIC_PATHS] });
    expect(r.sitemap).toBe("https://reindrop.example/sitemap.xml");
    expect(NON_PUBLIC_PATHS).toEqual(expect.arrayContaining(["/home", "/api/", "/dev", "/auth/"]));
  });

  it("sitemap: the landing page; legal drafts only once reviewed", () => {
    expect(sitemapEntries(SITE)).toEqual([{ url: "https://reindrop.example/" }]);
  });

  it("structured data mirrors the page: organization, website, the FAQ word for word - no product / price / rating claims", () => {
    const data = landingStructuredData(SITE, null)!;
    expect(data.map((d) => (d as { "@type": string })["@type"])).toEqual(["Organization", "WebSite", "FAQPage"]);
    const faq = data[2] as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(FAQ.map((f) => [f.question, f.answer]));
    const json = JSON.stringify(data);
    // Schema types and properties only (the FAQ's own prose may mention prices).
    const types = [...json.matchAll(/"@type":"(\w+)"/g)].map((m) => m[1]);
    expect(types.filter((t) => /Product|Offer|Review|Rating|SoftwareApplication|MobileApplication/.test(t!))).toEqual([]);
    expect(json).not.toMatch(/"(offers|price|priceCurrency|aggregateRating|review|ratingValue)":/);
    expect(json).not.toContain("contactPoint"); // only when a contact address is configured
    expect(JSON.stringify(landingStructuredData(SITE, "hello@reindrop.example"))).toContain('"email":"hello@reindrop.example"');
  });

  it("JSON-LD can't close its script tag", () => {
    expect(jsonLdScript({ a: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});

describe("social image text", () => {
  it("alt text describes the image without claims", () => {
    expect(SOCIAL_IMAGE_ALT).toMatch(/You flip it\. We find it\./);
    expect(SOCIAL_IMAGE_ALT).not.toMatch(/\d|guarantee|profit|best|#1/i);
  });
});
