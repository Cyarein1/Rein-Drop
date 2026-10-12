import type { Metadata, Viewport } from "next";
import { colors, cssVariablesBlock } from "@rein-drop/design-tokens";
import "@fontsource-variable/inter";
import { siteUrl } from "@/marketing/seo";
import "./globals.css";

// Absolute URLs (canonical, Open Graph image) resolve against the public origin - only when SITE_URL
// is set (Landing 22); nothing is guessed otherwise.
const site = siteUrl();

export const metadata: Metadata = {
  ...(site ? { metadataBase: site } : {}),
  title: { default: "Rein Drop", template: "%s · Rein Drop" },
  description: "AI-powered reseller sourcing",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the shell pad for notches/home indicators via env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: colors.canvas,
};

// Design tokens as CSS custom properties, generated from @rein-drop/design-tokens.
const tokenStyles = cssVariablesBlock();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <style>{tokenStyles}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
