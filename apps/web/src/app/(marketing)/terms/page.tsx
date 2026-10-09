import type { Metadata } from "next";
import { LegalPlaceholder } from "@/marketing/footer/LegalPlaceholder";

// Draft placeholder - kept out of search results until the reviewed terms exist.
export const metadata: Metadata = { title: "Terms of use (draft)", robots: { index: false, follow: true } };

export default function TermsPage() {
  return <LegalPlaceholder title="Terms of use" />;
}
