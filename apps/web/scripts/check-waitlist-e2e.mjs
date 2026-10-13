// LIVE waitlist end to end (Landing 24) against a running preview: real browser (phone width) ->
// web POST /api/waitlist -> API POST /waitlist -> PostgreSQL. Writes real rows, so run it only
// against a preview / CI database, never production. Checks:
// - a sign-up through the form (gallery pick + "Other" name + consent) shows the confirmation and
//   stores exactly one normalized row with the right fields;
// - the same address again (different case) gets the same answer and still one row;
// - a honeypot submission is answered like a success and stores nothing;
// - the email appears in no server log and in no analytics event.
//
//   node scripts/check-waitlist-e2e.mjs http://localhost:3100
// Database access (read-only, this test's own rows only):
//   PREVIEW_DB=compose  -> docker compose -f docker-compose.preview.yml exec postgres psql (default)
//   DATABASE_URL=...    -> psql "$DATABASE_URL" (CI service container)
// Server logs to scan for the email:
//   PREVIEW_LOGS=compose (default) | LOG_FILES=api.log,web.log (CI)
// CHROME_PATH overrides the browser.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3100";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const compose = ["compose", "-f", path.join(repoRoot, "docker-compose.preview.yml")];
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) && process.env.ALLOW_WRITES !== "1") {
  console.error(`Refusing to write test sign-ups to ${base}: not a local preview. Set ALLOW_WRITES=1 only for a disposable preview / CI database.`);
  process.exit(2);
}
const runId = Date.now().toString(36);
const EMAIL = `preview.e2e+${runId}@example.com`;
const TRAP_EMAIL = `preview.trap+${runId}@example.com`;

/** One SQL query returning tab-separated text (only this test's own addresses are ever read). */
function sql(query) {
  if (process.env.DATABASE_URL) return execFileSync("psql", [process.env.DATABASE_URL, "-tAF", "\t", "-c", query], { encoding: "utf8" }).trim();
  return execFileSync("docker", [...compose, "exec", "-T", "postgres", "psql", "-tAF", "\t", "-c", query], { encoding: "utf8" }).trim();
}
function serverLogs() {
  if (process.env.LOG_FILES) return process.env.LOG_FILES.split(",").map((f) => (existsSync(f) ? readFileSync(f, "utf8") : "")).join("\n");
  return execFileSync("docker", [...compose, "logs", "--no-color", "api", "web"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const port = 9334;
const browser = process.env.CHROME_PATH ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome / Edge found - set CHROME_PATH");
const chrome = spawn(browser, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "rd-e2e-"))}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 75 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ } if (!target) await sleep(200); }
if (!target) throw new Error("Browser didn't start");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
const analytics = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && m.params.args?.[0]?.value === "[landing-analytics]") analytics.push(JSON.stringify(m.params.args.slice(1).map((a) => a.value ?? a.preview)));
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed"); return r.result.value; };
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

const open = async () => { await send("Page.navigate", { url: `${base}/` }); await evaluate(`(async () => { const s = Date.now(); while (!document.getElementById('waitlist-email') && Date.now() - s < 15000) await new Promise((r) => setTimeout(r, 100)); })()`); await sleep(500); };
const typeEmail = async (value) => { await evaluate(`(() => { const i = document.getElementById('waitlist-email'); i.scrollIntoView({ block: 'center', behavior: 'instant' }); i.focus(); i.select(); })()`); await send("Input.insertText", { text: value }); await sleep(100); };
const submitAndWait = () => evaluate(`(async () => {
  document.querySelector('#waitlist button[type="submit"]').click();
  const s = Date.now();
  while (Date.now() - s < 15000) {
    const ok = document.querySelector('#waitlist [role="status"]'); if (ok) return { success: ok.textContent };
    const err = document.querySelector('#waitlist form [role="alert"]:not(p)'); if (err && !document.querySelector('#waitlist form[aria-busy="true"]')) return { error: err.textContent };
    await new Promise((r) => setTimeout(r, 100));
  }
  return { timeout: true };
})()`);

try {
  // 1. A real sign-up through the form, with a gallery pick and a named "Other".
  await open();
  await evaluate(`(() => { const b = document.querySelector('#marketplaces button[aria-label="Request Etsy"]'); b.scrollIntoView({ block: 'center', behavior: 'instant' }); b.click(); document.querySelector('#marketplaces button[aria-pressed]:not([aria-label])').click(); })()`);
  await sleep(200);
  await evaluate(`(() => { const i = document.getElementById('waitlist-other-marketplace'); i.scrollIntoView({ block: 'center', behavior: 'instant' }); i.focus(); })()`);
  await send("Input.insertText", { text: "Kijiji" });
  await typeEmail(`  ${EMAIL.toUpperCase()} `);
  await evaluate(`document.getElementById('waitlist-consent').click()`);
  let r = await submitAndWait();
  check("live sign-up: the form shows the confirmation", (r.success ?? "").includes("You're on the early-access list."), JSON.stringify(r));
  const row = sql(`select email, source, array_to_string("requestedMarketplaces", ','), coalesce("requestedMarketplaceOther", ''), "consentVersion", "createdAt" is not null from "WaitlistSignup" where email = '${EMAIL}'`);
  check("database: exactly one row, normalized email, picks, Other name, consent version", row === [EMAIL, "landing_waitlist_form", "etsy,other", "Kijiji", "2026-10-12", "t"].join("\t"), row.replace(/\t/g, " | "));

  // 2. Same address again (different case): same answer, still one row.
  await open();
  await typeEmail(EMAIL.replace("preview", "PREVIEW"));
  await evaluate(`document.getElementById('waitlist-consent').click()`);
  r = await submitAndWait();
  const count = sql(`select count(*) from "WaitlistSignup" where email = '${EMAIL}'`);
  check("repeat sign-up: same confirmation (no 'already joined' hint), still one row", (r.success ?? "").includes("You're on the early-access list.") && !/already/i.test(r.success ?? "") && count === "1", `${JSON.stringify(r)} rows=${count}`);

  // 3. Honeypot filled (a bot): answered like a success, nothing stored.
  const trap = await evaluate(`fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: '${TRAP_EMAIL}', source: 'landing_waitlist_form', requestedMarketplaces: [], requestedMarketplaceOther: null, consentVersion: '2026-10-12', website: 'http://spam.example' }) }).then(async (res) => ({ status: res.status, body: await res.json() }))`);
  const trapRows = sql(`select count(*) from "WaitlistSignup" where email = '${TRAP_EMAIL}'`);
  check("honeypot: 202 'received', nothing stored", trap.status === 202 && trap.body.status === "received" && trapRows === "0", `${JSON.stringify(trap)} rows=${trapRows}`);

  // 4. Invalid email: message from the form, nothing sent.
  await open();
  await typeEmail("not-an-email");
  await evaluate(`document.getElementById('waitlist-consent').click(); document.querySelector('#waitlist button[type="submit"]').click()`);
  await sleep(300);
  const invalid = await evaluate(`document.getElementById('waitlist-email-error')?.textContent ?? null`);
  check("invalid email: message next to the field", (invalid ?? "").startsWith("Enter a valid email address"), invalid);

  // 5. Privacy: the email in no server log and no analytics event.
  await sleep(1000);
  const logs = serverLogs().toLowerCase();
  const local = EMAIL.split("@")[0].toLowerCase();
  check("server logs (web + API) never contain the email or the Other name", logs.length > 0 && !logs.includes(local) && !logs.includes("kijiji") && /waitlist/.test(logs), `${logs.length} chars of logs scanned`);
  const events = analytics.join(" ").toLowerCase();
  check("analytics events: waitlist_succeeded + marketplace requests, no email or Other name", events.includes("waitlist_succeeded") && events.includes("marketplace_requested") && !events.includes(local) && !events.includes("kijiji"), analytics.slice(-4).join(" ; "));
} catch (err) {
  check("script ran to the end", false, String(err?.stack ?? err));
} finally {
  ws.close();
  chrome.kill();
}

console.log(`run ${runId} (test addresses: ${EMAIL}, ${TRAP_EMAIL})`);
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
