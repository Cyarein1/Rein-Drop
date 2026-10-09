import type { Metadata } from "next";
import { LegalPlaceholder } from "@/marketing/footer/LegalPlaceholder";

// Draft placeholder - kept out of search results until the reviewed policy exists.
export const metadata: Metadata = { title: "Privacy policy (draft)", robots: { index: false, follow: true } };

export default function PrivacyPage() {
  return <LegalPlaceholder title="Privacy policy" />;
}
