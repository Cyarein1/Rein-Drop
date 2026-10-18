import type { Metadata, Viewport } from "next";
import { colors, cssVariablesBlock } from "@rein-drop/design-tokens";
import localFont from "next/font/local";
import { siteUrl } from "@/marketing/seo";
import "./globals.css";

/**
 * Inter, the brand typeface (Landing 23). Before, the @fontsource CSS registered the family as
 * "Inter Variable" while the tokens ask for "Inter", so no visitor ever got Inter. next/font
 * self-hosts the one latin variable file (47 KB, every weight), preloads it, uses font-display: swap
 * and adds a size-adjusted fallback so the swap doesn't shift the layout.
 */
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--rd-font-inter",
  adjustFontFallback: "Arial",
});

// Absolute URLs (canonical, Open Graph image) resolve against the public origin - only when SITE_URL
// is set (Landing 22); nothing is guessed otherwise.
const site = siteUrl();

export const metadata: Metadata = {
  ...(site ? { metadataBase: site } : {}),
  title: { default: "Rein Drop", template: "%s · Rein Drop" },
  description: "AI-powered reseller sourcing",
  // Approved app icon (no /favicon.ico existed - every page logged a 404).
  icons: {
    icon: [
      { url: "/assets/brand/icon/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/assets/brand/icon/app-icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/assets/brand/icon/apple-touch-icon.png",
  },
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
    <html lang="en" className={inter.variable}>
      <head>
        <style>{tokenStyles}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
