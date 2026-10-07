import type { Metadata } from "next";
import { cssVariablesBlock } from "@rein-drop/design-tokens";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rein Drop",
  description: "AI-powered reseller sourcing",
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
