import type { MetadataRoute } from "next";
import { robotsRules } from "@/marketing/seo";

/** robots.txt (Landing 22): blocks everything until SITE_URL is set; then only the public pages. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
