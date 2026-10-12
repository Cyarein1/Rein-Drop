import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/marketing/seo";

/** sitemap.xml (Landing 22): the landing page (+ legal pages once reviewed); empty without SITE_URL. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
