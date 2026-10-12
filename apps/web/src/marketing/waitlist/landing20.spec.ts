import { describe, expect, it, vi } from "vitest";
import { joinWaitlistRequestSchema, normalizeWaitlistEmail, WAITLIST_CONSENT_VERSION_PATTERN, WAITLIST_SOURCES } from "@rein-drop/contracts";
import { LEGAL_DRAFT_STATUS, LEGAL_DRAFTS, PRIVACY_DRAFT, TERMS_DRAFT } from "../legal/legal-drafts";
import { emailProblem, WAITLIST_CONSENT_LABEL, WAITLIST_CONSENT_VERSION, WAITLIST_FINE_PRINT, WAITLIST_SOURCE } from "./consent";
import { FAILURE_MESSAGES, submitWaitlist, waitlistPayload, type WaitlistFormValues } from "./submit";

const values: WaitlistFormValues = { email: "Sam@Example.com", requestedMarketplaces: ["offerup", "other"], requestedMarketplaceOther: "Kijiji", website: "" };
const respond = (status: number, body?: unknown) => vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe("waitlist form", () => {
  it("client email check agrees with the server's normalization", () => {
    const samples = ["sam@example.com", " SAM@EXAMPLE.COM ", "a.b+c@sub.example.co.za", "", "   ", "sam", "sam@", "@example.com", "sam@example", "sam @example.com", "a@@b.co", `${"a".repeat(250)}@example.com`];
    for (const s of samples) expect(emailProblem(s) === null, s).toBe(normalizeWaitlistEmail(s) !== null);
    expect(emailProblem("")).toBe("Enter your email address");
  });

  it("sends exactly what the API contract accepts (consent version, source, picks)", () => {
    const parsed = joinWaitlistRequestSchema.safeParse(waitlistPayload(values));
    expect(parsed.success).toBe(true);
    expect(waitlistPayload(values)).toMatchObject({ source: WAITLIST_SOURCE, consentVersion: WAITLIST_CONSENT_VERSION, website: "" });
    expect(WAITLIST_SOURCES).toContain(WAITLIST_SOURCE);
    expect(WAITLIST_CONSENT_VERSION_PATTERN.test(WAITLIST_CONSENT_VERSION)).toBe(true);
    // No picks is fine too.
    expect(joinWaitlistRequestSchema.safeParse(waitlistPayload({ ...values, requestedMarketplaces: [], requestedMarketplaceOther: null })).success).toBe(true);
  });

  it.each([
    [202, { status: "received" }, { kind: "success" }],
    [400, { fields: [{ field: "email", message: "Enter a valid email address" }] }, { kind: "invalid", fields: { email: "Enter a valid email address" } }],
    [400, undefined, { kind: "invalid", fields: {} }],
    [429, { code: "RATE_LIMITED" }, { kind: "rate_limited" }],
    [503, { code: "UNAVAILABLE" }, { kind: "unavailable" }],
    [500, undefined, { kind: "unavailable" }],
    [403, { code: "FORBIDDEN" }, { kind: "unavailable" }],
  ])("HTTP %i -> %o outcome", async (status, body, outcome) => {
    const fetch = respond(status, body);
    await expect(submitWaitlist(values, fetch as unknown as typeof globalThis.fetch)).resolves.toEqual(outcome);
    expect(fetch).toHaveBeenCalledWith("/api/waitlist", expect.objectContaining({ method: "POST" }));
  });

  it("no answer (offline or timeout) -> network outcome", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(submitWaitlist(values, offline as unknown as typeof fetch)).resolves.toEqual({ kind: "network" });
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(submitWaitlist(values, hang as unknown as typeof fetch, 20)).resolves.toEqual({ kind: "network" });
  });

  it("consent and failure copy promise nothing that doesn't exist", () => {
    const text = [WAITLIST_CONSENT_LABEL, WAITLIST_FINE_PRINT, ...Object.values(FAILURE_MESSAGES)].join(" ");
    expect(text).not.toMatch(/unsubscribe|never|guarantee|always|instantly|spam-free|\d+ (days|hours)/i);
    expect(WAITLIST_CONSENT_LABEL).toMatch(/privacy notice/);
  });
});

describe("legal drafts", () => {
  const all = Object.values(LEGAL_DRAFTS);
  const fullText = (d: (typeof all)[number]) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.toConfirm ?? [])])].join(" ");

  it("are unreviewed drafts with the status the pages show", () => {
    for (const d of all) expect(d.reviewed).toBe(false);
    expect(LEGAL_DRAFT_STATUS).toBe("Draft - requires legal review");
  });

  it("the privacy notice version is the consent version stored with each sign-up", () => {
    expect(PRIVACY_DRAFT.version).toBe(WAITLIST_CONSENT_VERSION);
  });

  it("the privacy notice names every field the sign-up stores", () => {
    const t = fullText(PRIVACY_DRAFT).toLowerCase();
    for (const field of ["email address", "marketplaces", "other", "version of this notice", "when you signed up", "which form"]) expect(t, field).toContain(field);
  });

  it("make no unsupported guarantees (only negated ones)", () => {
    for (const d of all) {
      const t = fullText(d);
      // Promises are only allowed in the negative ("doesn't guarantee", "not a promise", "No system is completely secure").
      const withoutNegations = t.replace(/doesn't guarantee/g, "").replace(/not a promise/g, "").replace(/No system is completely secure/g, "");
      expect(withoutNegations).not.toMatch(/guarantee|promise|100%|completely secure|always available|will never|we ensure|fully secure/i);
      expect(t).not.toMatch(/\bunsubscribe\b/i); // no email sending / unsubscribe mechanism exists yet
    }
    expect(fullText(PRIVACY_DRAFT)).toMatch(/No system is completely secure/);
    expect(fullText(TERMS_DRAFT)).toMatch(/doesn't guarantee access/);
  });

  it("leave open points open instead of inventing them", () => {
    const open = all.flatMap((d) => d.sections.flatMap((s) => s.toConfirm ?? []));
    expect(open.length).toBeGreaterThanOrEqual(8);
    expect(open.join(" ")).toMatch(/legal entity/);
    expect(open.join(" ")).toMatch(/Retention period/);
    expect(open.join(" ")).toMatch(/govern/);
  });
});
