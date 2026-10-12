"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { trackLanding } from "../analytics/analytics";
import { ContactLink } from "../contact/ContactLink";
import { landingImages } from "../landing-assets";
import { dispatchInterest, useMarketplaceInterest } from "../marketplaces/interest-store";
import { emailProblem, WAITLIST_CONSENT, WAITLIST_FINE_PRINT } from "../waitlist/consent";
import { FAILURE_MESSAGES, submitWaitlist, type SubmitOutcome, type WaitlistFormValues } from "../waitlist/submit";
import styles from "./ClosingCta.module.css";
import { WaitlistInterest } from "./WaitlistInterest";

type Phase = { kind: "idle" } | { kind: "submitting" } | { kind: "success" } | { kind: "error"; outcome: Exclude<SubmitOutcome, { kind: "success" }> };

const confirmed = landingImages.confirmedMascot;

/**
 * The one early-access form (Landing 20) - every "Join early access" on the page leads here
 * (#waitlist). Email + explicit consent + optional marketplace requests, sent to POST /api/waitlist.
 * States: idle -> submitting (button busy, no double submit) -> success (focus moves to the
 * confirmation) | error (announced, focus kept, Try again when retrying can help, contact path).
 * Field problems are shown next to the field and announced; the first one gets focus.
 */
export function WaitlistForm({ contactEmail }: { contactEmail: string | null }) {
  const interest = useMarketplaceInterest();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const submitting = phase.kind === "submitting";

  useEffect(() => {
    if (phase.kind === "success") successRef.current?.focus();
  }, [phase.kind]);

  const values = (): WaitlistFormValues => ({
    email,
    requestedMarketplaces: [...interest.keys, ...(interest.other ? ["other"] : [])],
    requestedMarketplaceOther: interest.other && interest.otherText.trim() ? interest.otherText.trim() : null,
    website,
  });

  const send = async () => {
    if (submitting) return;
    const emailIssue = emailProblem(email);
    const consentIssue = consent ? null : "Tick the box to agree before joining";
    setEmailError(emailIssue);
    setConsentError(consentIssue);
    if (emailIssue || consentIssue) {
      setPhase({ kind: "idle" });
      (emailIssue ? emailRef : consentRef).current?.focus();
      return;
    }
    setPhase({ kind: "submitting" });
    const sent = values();
    const outcome = await submitWaitlist(sent);
    if (outcome.kind === "success") {
      // Anonymous: only how many marketplaces were picked - never the email or the typed name.
      trackLanding("waitlist_succeeded", { requested: Math.min(16, sent.requestedMarketplaces.length) });
      dispatchInterest({ type: "clear" });
      setPhase({ kind: "success" });
      return;
    }
    if (outcome.kind === "invalid" && outcome.fields.email) {
      setEmailError(outcome.fields.email);
      emailRef.current?.focus();
    }
    setPhase({ kind: "error", outcome });
  };

  if (phase.kind === "success") {
    return (
      <div ref={successRef} tabIndex={-1} className={styles.success} role="status">
        {confirmed && <Image src={confirmed.src} width={confirmed.width} height={confirmed.height} alt="" sizes="96px" className={styles.successMascot} />}
        <div>
          <p className={styles.successTitle}>You&apos;re on the early-access list.</p>
          <p className={styles.successText}>Thanks for joining. We&apos;ll be in touch by email about early access.</p>
        </div>
      </div>
    );
  }

  const retryable = phase.kind === "error" && (phase.outcome.kind === "unavailable" || phase.outcome.kind === "network");
  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={submitting || undefined}
      aria-describedby="waitlist-fine-print"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className={[styles.formRow, emailError ? styles.formRowInvalid : ""].filter(Boolean).join(" ")}>
        <label htmlFor="waitlist-email" className="visually-hidden">
          Email address
        </label>
        <input
          ref={emailRef}
          id="waitlist-email"
          type="email"
          name="email"
          placeholder="Enter your email address"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "waitlist-email-error" : undefined}
          readOnly={submitting}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          className={styles.input}
        />
        <button type="submit" className={styles.button} aria-disabled={submitting || undefined}>
          {submitting ? (
            <>
              <LoaderCircle aria-hidden size={18} className={styles.spinner} />
              Joining…
            </>
          ) : (
            "Join early access"
          )}
        </button>
      </div>
      {emailError && (
        <p id="waitlist-email-error" className={styles.fieldError} role="alert">
          {emailError}
        </p>
      )}

      <div className={styles.consent}>
        <input
          ref={consentRef}
          id="waitlist-consent"
          type="checkbox"
          checked={consent}
          required
          aria-required="true"
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? "waitlist-consent-error" : undefined}
          disabled={submitting}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (consentError) setConsentError(null);
          }}
        />
        <label htmlFor="waitlist-consent">
          {WAITLIST_CONSENT.lead}
          <a href="/privacy" target="_blank" rel="noopener">
            {WAITLIST_CONSENT.link}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
          {WAITLIST_CONSENT.tail}
        </label>
      </div>
      {consentError && (
        <p id="waitlist-consent-error" className={styles.fieldError} role="alert">
          {consentError}
        </p>
      )}

      <WaitlistInterest disabled={submitting} />

      {/* Honeypot - off-screen (not display:none), skipped by keyboards and screen readers. */}
      <div className={styles.trap} aria-hidden="true">
        <label htmlFor="waitlist-website">Leave this empty</label>
        <input id="waitlist-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {phase.kind === "error" && (
        <div className={styles.formError} role="alert">
          <CircleAlert aria-hidden size={18} />
          <div>
            <p>{FAILURE_MESSAGES[phase.outcome.kind]}</p>
            {retryable && (
              <p className={styles.formErrorHelp}>
                Still not working? Contact us: <ContactLink email={contactEmail} tone="dark" />
              </p>
            )}
          </div>
          {retryable && (
            <button type="button" className={styles.retry} onClick={() => void send()}>
              <RotateCcw aria-hidden size={16} />
              Try again
            </button>
          )}
        </div>
      )}

      <p id="waitlist-fine-print" className={styles.finePrint}>
        {WAITLIST_FINE_PRINT}
      </p>
    </form>
  );
}
