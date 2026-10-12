import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WAITLIST_REQUESTABLE_MARKETPLACES } from "@rein-drop/contracts";
import { REQUESTABLE_MARKETPLACES } from "../marketplaces/marketplace-interest";

vi.mock("server-only", () => ({}));
const { clientIp, createWaitlistHandler, RateLimiter, WAITLIST_MAX_BODY_BYTES, WAITLIST_RATE_LIMIT } = await import("./waitlist-route");
type Deps = Parameters<typeof createWaitlistHandler>[0];

const EMAIL = "Private.Person@Example.com";
const VALID = { email: EMAIL, source: "landing_waitlist_form", requestedMarketplaces: ["offerup", "other"], requestedMarketplaceOther: "Kijiji", consentVersion: "2026-10-12" };

function setup(forward: Deps["forward"] = async () => ({ ok: true })) {
  const logs: unknown[] = [];
  const forwardSpy = vi.fn(forward);
  const handler = createWaitlistHandler({ forward: forwardSpy, limiter: new RateLimiter(), log: (e) => logs.push(e) });
  return { handler, forward: forwardSpy, logs };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://reindrop.example/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json", host: "reindrop.example", origin: "https://reindrop.example", "x-forwarded-for": "203.0.113.7", ...headers },
    body: text,
  });
}

const read = async (res: Response) => ({ status: res.status, body: await res.json(), cache: res.headers.get("cache-control") });

describe("POST /api/waitlist", () => {
  it("validates server-side, forwards the normalized sign-up and answers 202 'received'", async () => {
    const { handler, forward, logs } = setup();
    const res = await read(await handler(post(VALID)));
    expect(res).toEqual({ status: 202, body: { status: "received" }, cache: "no-store" });
    expect(forward).toHaveBeenCalledWith({ ...VALID, email: "private.person@example.com" });
    expect(logs).toEqual([{ event: "waitlist_request", outcome: "received", status: 202 }]);
  });

  it("a repeat address gets exactly the same answer (the API treats it as a no-op)", async () => {
    const { handler } = setup();
    const first = await read(await handler(post(VALID)));
    const second = await read(await handler(post({ ...VALID, email: EMAIL.toUpperCase() })));
    expect(second).toEqual(first);
  });

  it("invalid input: 400 with field names and fixed messages - never the input", async () => {
    const { handler, forward, logs } = setup();
    const res = await read(await handler(post({ ...VALID, email: "private.person@nowhere", consentVersion: "v1" })));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: "error", code: "INVALID" });
    expect(res.body.fields.map((f: { field: string }) => f.field).sort()).toEqual(["consentVersion", "email"]);
    expect(JSON.stringify(res.body)).not.toContain("private.person");
    expect(forward).not.toHaveBeenCalled();
    expect(logs).toEqual([{ event: "waitlist_request", outcome: "invalid", status: 400, fields: ["email", "consentVersion"] }]);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON array", "[]"],
    ["a JSON string", '"hello"'],
  ])("rejects %s with a generic 400", async (_n, body) => {
    const { handler, forward } = setup();
    const res = await read(await handler(post(body)));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID");
    expect(forward).not.toHaveBeenCalled();
  });

  it("honeypot filled: answers like a success but stores nothing", async () => {
    const { handler, forward, logs } = setup();
    const res = await read(await handler(post({ ...VALID, website: "http://spam.example" })));
    expect(res).toMatchObject({ status: 202, body: { status: "received" } });
    expect(forward).not.toHaveBeenCalled();
    expect(logs).toEqual([{ event: "waitlist_request", outcome: "honeypot", status: 202 }]);
    // An empty honeypot (what real people send) is fine.
    expect((await handler(post({ ...VALID, website: "" }))).status).toBe(202);
  });

  it("cross-site posts are refused; same-site and non-browser callers are not", async () => {
    const { handler, forward } = setup();
    expect((await handler(post(VALID, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await handler(post(VALID, { origin: "not a url" }))).status).toBe(403);
    expect(forward).not.toHaveBeenCalled();
    const noOrigin = post(VALID);
    noOrigin.headers.delete("origin");
    expect((await handler(noOrigin)).status).toBe(202);
  });

  it("JSON only; oversized bodies refused before parsing", async () => {
    const { handler } = setup();
    expect((await handler(post(VALID, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handler(post({ ...VALID, padding: "x".repeat(WAITLIST_MAX_BODY_BYTES) }))).status).toBe(413);
    expect((await handler(post(VALID, { "content-length": String(WAITLIST_MAX_BODY_BYTES + 1) }))).status).toBe(413);
  });

  it(`rate limits each visitor (${WAITLIST_RATE_LIMIT.limit} per window) with Retry-After; others are unaffected`, async () => {
    const { handler, forward } = setup();
    for (let i = 0; i < WAITLIST_RATE_LIMIT.limit; i++) expect((await handler(post(VALID))).status).toBe(202);
    const limited = await handler(post(VALID));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(forward).toHaveBeenCalledTimes(WAITLIST_RATE_LIMIT.limit);
    expect((await handler(post(VALID, { "x-forwarded-for": "198.51.100.9" }))).status).toBe(202);
  });

  it("API problems become privacy-safe answers (no API text passed on)", async () => {
    const cases: [Awaited<ReturnType<Deps["forward"]>> | "throw", number, string][] = [
      [{ ok: false, status: 400 }, 400, "INVALID"],
      [{ ok: false, status: 429 }, 429, "RATE_LIMITED"],
      [{ ok: false, status: 500 }, 503, "UNAVAILABLE"],
      [{ ok: false }, 503, "UNAVAILABLE"],
      ["throw", 503, "UNAVAILABLE"],
    ];
    for (const [result, status, code] of cases) {
      const { handler } = setup(async () => {
        if (result === "throw") throw new Error(`database down for ${EMAIL}`);
        return result;
      });
      const res = await read(await handler(post(VALID)));
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expect(JSON.stringify(res.body)).not.toContain("database");
    }
  });

  it("logs never contain the email, the 'other' name or the visitor's IP", async () => {
    const { handler, logs } = setup(async () => ({ ok: false, status: 500 }));
    await handler(post(VALID));
    await handler(post({ ...VALID, email: "bad" }));
    await handler(post({ ...VALID, website: "x" }));
    const text = JSON.stringify(logs).toLowerCase();
    for (const secret of ["private.person", "kijiji", "203.0.113.7"]) expect(text).not.toContain(secret);
  });
});

describe("rate limiter + client IP", () => {
  it("resets after the window", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([null, null, 1]);
    now = 1000;
    expect(limiter.take("a")).toBeNull();
  });

  it("uses the rightmost X-Forwarded-For entry (the one the trusted proxy added)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("boundaries", () => {
  it("the landing's requestable marketplaces match the API contract", () => {
    expect([...REQUESTABLE_MARKETPLACES].sort()).toEqual([...WAITLIST_REQUESTABLE_MARKETPLACES].sort());
  });

  it("the web app never touches the database (no @rein-drop/db, no DATABASE_URL) - decision L-D3", () => {
    const root = path.resolve(__dirname, "../..");
    const files = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx|mjs|js)$/.test(e.name))
      .map((e) => path.join(e.parentPath, e.name));
    const offenders = files.filter((f) => /@rein-drop\/db|@prisma\/client|DATABASE_URL/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    // This spec names them in its own assertions.
    expect(offenders.filter((f) => !f.endsWith("waitlist-route.spec.ts"))).toEqual([]);
    const pkg = JSON.parse(readFileSync(path.resolve(root, "../package.json"), "utf8"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("@rein-drop/db");
  });
});
