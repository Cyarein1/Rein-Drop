import type { Metadata, MetadataRoute } from "next";
import { FAQ } from "./faq/faq";
import { LEGAL_DRAFTS } from "./legal/legal-drafts";

/**
 * Search and sharing metadata for the public site (Landing 22). Only accurate statements:
 * - Absolute URLs (canonical, sitemap, Open Graph url, structured data) exist ONLY when SITE_URL is
 *   set - the public origin, read at build time. Without it nothing is guessed: robots.txt blocks
 *   crawling and the landing page is noindex, so a preview / beta deployment never gets indexed.
 * - Structured data describes what is on the page: the organization's name / site / logo, the
 *   website, and the FAQ exactly as shown. No product, offer, price, rating or review markup.
 * - Legal drafts stay out of the sitemap and search results until they are reviewed.
 */

export const SITE_NAME = "Rein Drop";
export const LANDING_TITLE = "Rein Drop - You flip it. We find it.";
export const LANDING_DESCRIPTION =
  "Tell Rein Drop what you're hunting for. It keeps an eye on supported marketplaces, spots promising listings and gives you a heads-up.";
export const SOCIAL_IMAGE_ALT = "Rein Drop - You flip it. We find it. The Rein Drop mascot holding a parcel.";

/** Signed-in app, auth, API and development routes: never for search engines. */
export const NON_PUBLIC_PATHS = ["/home", "/hunts", "/deals", "/alerts", "/analytics", "/inventory", "/sell", "/settings", "/onboarding", "/sign-in", "/auth/", "/api/", "/dev", "/goodbye"] as const;

/** The public origin from SITE_URL (https; http only for localhost), or null when not configured. */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL | null {
  const raw = env.SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

/** The landing page's metadata (title, description, canonical, Open Graph, Twitter, robots). */
export function landingMetadata(site: URL | null = siteUrl()): Metadata {
  return {
    title: { absolute: LANDING_TITLE },
    description: LANDING_DESCRIPTION,
    ...(site ? { alternates: { canonical: "/" } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: LANDING_TITLE,
      description: LANDING_DESCRIPTION,
      locale: "en_US",
      ...(site ? { url: "/" } : {}),
    },
    twitter: { card: "summary_large_image", title: LANDING_TITLE, description: LANDING_DESCRIPTION },
    // No public origin configured = not the public site yet: keep it out of search results.
    ...(site ? {} : { robots: { index: false, follow: false } }),
  };
}

export function robotsRules(site: URL | null = siteUrl()): MetadataRoute.Robots {
  if (!site) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...NON_PUBLIC_PATHS] },
    sitemap: new URL("/sitemap.xml", site).toString(),
  };
}

export function sitemapEntries(site: URL | null = siteUrl()): MetadataRoute.Sitemap {
  if (!site) return [];
  const legal = Object.entries(LEGAL_DRAFTS)
    .filter(([, doc]) => doc.reviewed)
    .map(([path]) => ({ url: new URL(`/${path}`, site).toString() }));
  return [{ url: new URL("/", site).toString() }, ...legal];
}

/** JSON-LD for the landing page (null without a public origin - absolute URLs are required). */
export function landingStructuredData(site: URL | null = siteUrl(), contactEmail: string | null = null): object[] | null {
  if (!site) return null;
  const url = new URL("/", site).toString();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url,
      logo: new URL("/assets/brand/icon/app-icon-512.png", site).toString(),
      ...(contactEmail ? { contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: contactEmail } } : {}),
    },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    },
  ];
}

/** Safe to inline in a <script>: "<" can't close the tag (Next.js JSON-LD guide). */
export const jsonLdScript = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
