import type { Metadata } from "next";
import { LegalDraft } from "@/marketing/legal/LegalDraft";
import { TERMS_DRAFT } from "@/marketing/legal/legal-drafts";

// Kept out of search results until the reviewed terms exist.
export const metadata: Metadata = {
  title: TERMS_DRAFT.reviewed ? TERMS_DRAFT.title : `${TERMS_DRAFT.title} (draft)`,
  robots: TERMS_DRAFT.reviewed ? undefined : { index: false, follow: true },
};

export default function TermsPage() {
  return <LegalDraft doc={TERMS_DRAFT} />;
}
