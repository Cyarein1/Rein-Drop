import type { Metadata } from "next";
import { colors } from "@rein-drop/design-tokens";

export const metadata: Metadata = {
  title: "Rein Drop",
  description: "AI-powered reseller sourcing",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: colors.canvas,
          color: colors.navy,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
