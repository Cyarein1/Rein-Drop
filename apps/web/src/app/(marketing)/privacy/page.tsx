import type { Metadata } from "next";
import { LegalDraft } from "@/marketing/legal/LegalDraft";
import { PRIVACY_DRAFT } from "@/marketing/legal/legal-drafts";

// Kept out of search results until the reviewed notice exists.
export const metadata: Metadata = {
  title: PRIVACY_DRAFT.reviewed ? PRIVACY_DRAFT.title : `${PRIVACY_DRAFT.title} (draft)`,
  robots: PRIVACY_DRAFT.reviewed ? undefined : { index: false, follow: true },
};

export default function PrivacyPage() {
  return <LegalDraft doc={PRIVACY_DRAFT} />;
}
