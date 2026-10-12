// Browser check of the landing page: drives a headless Chrome / Edge over the DevTools protocol -
// no extra dependencies - and asserts the navigation (Landing 06: sticky bar, mobile menu focus /
// Tab wrap / Escape / outside click / resize, in-page links, reduced motion) and the hero
// (Landing 07: layout at 320-1440 px, the sample card never clipped and labelled illustrative,
// CTAs, store badges, priority mascot) and the marketplace gallery (Landing 08: honest statuses,
// expander by mouse and keyboard, official logos loaded undistorted) and the problem section
// (Landing 09: before / after layout, labelled CSS illustrations, nothing off-screen) and how it
// works (Landing 10: ordered steps, decorative connectors between them, mascot, "you decide") and
// deal intelligence (Landing 11: illustrative / estimate / gross labels, one green, no net profit) and
// hunts + alerts (Landing 12: illustration with no fake controls; push + in-app only, no timestamps) and
// outcomes / FAQ / closing CTA / footer / legal placeholders (Landing 13; no dead in-page links). Screenshots go to <outDir>. Until Playwright is added
// (landing QA steps) this is the landing page's browser test.
//
//   pnpm --filter web build && pnpm --filter web start   (or any running web server)
//   node scripts/check-landing.mjs http://localhost:3000 .browser-check
//
// CHROME_PATH overrides the browser (default: Chrome, else Edge, Windows install paths).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [base, outArg = ".browser-check"] = process.argv.slice(2);
const outDir = path.resolve(outArg);
mkdirSync(outDir, { recursive: true });
const port = 9333;
const browser = process.env.CHROME_PATH ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome / Edge found - set CHROME_PATH");
const chrome = spawn(browser, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "rd-nav-check-"))}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 75 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
  if (!target) await sleep(200);
}
if (!target) throw new Error(`Browser didn't open a debuggable page on port ${port}`);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result))); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name) => writeFileSync(path.join(outDir, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"));
const key = async (k, shift = false) => {
  const code = { Tab: 9, Escape: 27 }[k];
  for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 });
  await sleep(80);
};
const viewport = async (width, height, mobile) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
const load = async (url) => { await send("Page.navigate", { url }); await sleep(1500); };
const results = [];
/** After an in-page link: wait until smooth scrolling has stopped (scrollY stable for 300 ms, max 5 s). */
const settleScroll = () => evaluate(`(async () => { let last = -1, stable = 0; const start = Date.now();
  while (Date.now() - start < 5000) { await new Promise((r) => setTimeout(r, 100)); if (scrollY === last) { if ((stable += 100) >= 300) return; } else { stable = 0; last = scrollY; } } })()`);
/** Screenshot with `selector` at the top, after letting late-loading content above settle. */
const shotAt = async (selector, name) => {
  for (let i = 0; i < 2; i++) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView()`); await sleep(500); }
  await shot(name);
};
const check = (name, ok, detail = "") => { results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`); };

await send("Page.enable"); await send("Runtime.enable");

// ---- Desktop ----
await viewport(1280, 900, false);
await load(`${base}/`);
const desk = await evaluate(`(() => {
  const vis = (s) => { const el = document.querySelector(s); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; };
  return { navLinks: [...document.querySelectorAll('nav[aria-label="Main"] a')].map(a => a.textContent + '>' + a.getAttribute('href')),
    menuButtonVisible: vis('button[aria-controls]'), signInVisible: [...document.querySelectorAll('header a')].some(a => a.textContent === 'Sign in' && a.getBoundingClientRect().width > 0),
    cta: [...document.querySelectorAll('header a')].filter(a => a.textContent === 'Join early access').map(a => a.getAttribute('href')),
    scrolled: document.querySelector('header').hasAttribute('data-scrolled'), position: getComputedStyle(document.querySelector('header')).position,
    wordmark: (() => { const i = document.querySelector('header img'); return i && { w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height, natural: i.naturalWidth + 'x' + i.naturalHeight }; })(),
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`);
check("desktop: inline links", desk.navLinks.join(",") === "How it works>#how-it-works,Features>#intelligence,Marketplaces>#marketplaces,FAQ>#faq", desk.navLinks.join(", "));
check("desktop: menu button hidden, Sign in shown", !desk.menuButtonVisible && desk.signInVisible);
check("desktop: CTA -> #waitlist", desk.cta.length === 1 && desk.cta[0] === "#waitlist", desk.cta.join(","));
check("desktop: sticky, transparent at top (hero wash shows through)", desk.position === "sticky" && !desk.scrolled);
check("desktop: wordmark not stretched", desk.wordmark && Math.abs(desk.wordmark.w / desk.wordmark.h - 570 / 192) < 0.05, JSON.stringify(desk.wordmark));
check("desktop: no horizontal overflow", !desk.overflowX);
await shot("desktop-top");
await evaluate(`window.scrollTo(0, 700)`); await sleep(400);
const afterScroll = await evaluate(`({ scrolled: document.querySelector('header').hasAttribute('data-scrolled'), top: document.querySelector('header').getBoundingClientRect().top })`);
check("desktop: bar turns solid after scrolling and stays at the top", afterScroll.scrolled && afterScroll.top === 0, JSON.stringify(afterScroll));
await shot("desktop-scrolled");
await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="#faq"]').click()`); await settleScroll();
const faq = await evaluate(`({ hash: location.hash, focus: document.activeElement.id, top: Math.round(document.getElementById('faq').getBoundingClientRect().top), atBottom: Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight })`);
// Below the bar - or as far as the page can scroll (the skeleton's last sections are short).
check("desktop: FAQ link scrolls below the bar and focuses the section", faq.hash === "#faq" && faq.focus === "faq" && faq.top >= 64 && (faq.top <= 96 || faq.atBottom), JSON.stringify(faq));
const smooth = await evaluate(`getComputedStyle(document.documentElement).scrollBehavior`);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const reduced = await evaluate(`getComputedStyle(document.documentElement).scrollBehavior`);
await send("Emulation.setEmulatedMedia", { features: [] });
check("smooth scrolling only without reduced motion", smooth === "smooth" && reduced === "auto", `${smooth} / ${reduced}`);

// ---- Mobile ----
for (const width of [375, 320]) {
  await viewport(width, 760, true);
  await load(`${base}/`);
  const m = await evaluate(`(() => {
    const b = document.querySelector('button[aria-controls]');
    const r = (el) => el.getBoundingClientRect();
    const bar = [...document.querySelectorAll('header .' + 'x')];
    const cta = [...document.querySelectorAll('header a')].find(a => a.textContent === 'Join early access' && r(a).width > 0);
    return { desktopNavHidden: getComputedStyle(document.querySelector('nav[aria-label="Main"]')).display === 'none',
      button: b && { expanded: b.getAttribute('aria-expanded'), label: b.textContent, size: r(b).width + 'x' + r(b).height, right: r(b).right },
      ctaVisible: !!cta, ctaRight: cta && r(cta).right, panelHidden: document.getElementById(b.getAttribute('aria-controls')).hidden,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  })()`);
  check(`${width}px: compact bar (no inline links, CTA + 48px menu button, no overflow)`, m.desktopNavHidden && m.ctaVisible && m.button.size === "48x48" && !m.overflowX && m.button.right <= width, JSON.stringify(m));
  check(`${width}px: menu closed by default with an accessible name`, m.button.expanded === "false" && m.panelHidden && m.button.label === "Open menu", m.button.label);
  await shot(`mobile-${width}-closed`);
}

// Open with the button.
await viewport(375, 760, true);
await load(`${base}/`);
await evaluate(`document.querySelector('button[aria-controls]').click()`); await sleep(250);
let s = await evaluate(`(() => { const b = document.querySelector('button[aria-controls]'); const p = document.getElementById(b.getAttribute('aria-controls'));
  return { expanded: b.getAttribute('aria-expanded'), label: b.textContent, panelHidden: p.hidden, focus: document.activeElement.textContent, overflow: document.documentElement.style.overflow,
    items: [...p.querySelectorAll('a')].map(a => a.textContent) }; })()`);
check("open: aria-expanded true, label 'Close menu', panel shown", s.expanded === "true" && s.label === "Close menu" && !s.panelHidden, JSON.stringify(s));
check("open: focus moves to the first link", s.focus === "How it works", s.focus);
check("open: page behind can't scroll", s.overflow === "hidden");
check("open: panel lists the links + Sign in", s.items.join(",") === "How it works,Features,Marketplaces,FAQ,Sign in", s.items.join(","));
await shot("mobile-375-open");
// Tab to the end wraps to the menu button, Shift+Tab wraps back.
for (let i = 0; i < 4; i++) await key("Tab");
const lastFocus = await evaluate(`document.activeElement.textContent`);
await key("Tab");
const wrapped = await evaluate(`document.activeElement.getAttribute('aria-controls') !== null`);
await key("Tab", true);
const back = await evaluate(`document.activeElement.textContent`);
check("keyboard: Tab wraps from the last item to the menu button and Shift+Tab back", lastFocus === "Sign in" && wrapped && back === "Sign in", `${lastFocus} -> button:${wrapped} -> ${back}`);
await key("Escape");
s = await evaluate(`(() => { const b = document.querySelector('button[aria-controls]'); return { expanded: b.getAttribute('aria-expanded'), focusIsButton: document.activeElement === b, overflow: document.documentElement.style.overflow, panelHidden: document.getElementById(b.getAttribute('aria-controls')).hidden }; })()`);
check("Escape closes and returns focus to the menu button", s.expanded === "false" && s.focusIsButton && s.panelHidden && s.overflow === "", JSON.stringify(s));
// A link closes the menu and lands on its section.
await evaluate(`document.querySelector('button[aria-controls]').click()`); await sleep(250);
await evaluate(`[...document.getElementById(document.querySelector('button[aria-controls]').getAttribute('aria-controls')).querySelectorAll('a')].find(a => a.textContent === 'Marketplaces').click()`); await settleScroll();
s = await evaluate(`({ expanded: document.querySelector('button[aria-controls]').getAttribute('aria-expanded'), hash: location.hash, focus: document.activeElement.id, top: Math.round(document.getElementById('marketplaces').getBoundingClientRect().top) })`);
check("menu link: closes, scrolls below the bar, focuses the section", s.expanded === "false" && s.hash === "#marketplaces" && s.focus === "marketplaces" && s.top >= 64 && s.top <= 96, JSON.stringify(s));
// Clicking outside (on the bar, not a control) closes; widening to desktop closes.
await evaluate(`document.querySelector('button[aria-controls]').click()`); await sleep(250);
// A point on the bar that is not a link or button.
const spot = await evaluate(`(() => { for (let x = 5; x < innerWidth; x += 5) { const el = document.elementFromPoint(x, 32); if (el && !el.closest('a,button')) return { x, tag: el.tagName }; } return null; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: spot.x, y: 32, button: "left", clickCount: 1, pointerType: "mouse" });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: spot.x, y: 32, button: "left", clickCount: 1, pointerType: "mouse" });
await sleep(250);
const outside = await evaluate(`({ hash: location.hash, expanded: document.querySelector('button[aria-controls]').getAttribute('aria-expanded') })`);
check("click outside the menu (not on a control) closes it", spot && outside.expanded === "false", JSON.stringify({ ...spot, ...outside }));
await evaluate(`document.querySelector('button[aria-controls]').click()`); await sleep(250);
await viewport(1280, 900, false); await sleep(400);
const widened = await evaluate(`({ expanded: document.querySelector('button[aria-controls]').getAttribute('aria-expanded'), overflow: document.documentElement.style.overflow })`);
check("widening to desktop closes the menu", widened.expanded === "false" && widened.overflow === "", JSON.stringify(widened));
// Skip link is the first Tab stop and becomes visible.
await viewport(1280, 900, false); await load(`${base}/`);
await key("Tab");
const skip = await evaluate(`({ text: document.activeElement.textContent, top: document.activeElement.getBoundingClientRect().top })`);
check("skip link is the first Tab stop and shows on focus", skip.text === "Skip to content" && skip.top >= 0, JSON.stringify(skip));

// ---- Hero (Landing 07) ----
for (const [width, height, mobile] of [[1440, 900, false], [1280, 800, false], [1024, 768, false], [768, 1024, true], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  const h = await evaluate(`(() => {
    const hero = document.getElementById('hero');
    const r = (el) => el.getBoundingClientRect();
    const card = hero.querySelector('figure');
    const mascot = hero.querySelector('img[fetchpriority="high"], img[loading="eager"]');
    const inView = (el) => { const b = r(el); return b.left >= 0 && b.right <= innerWidth + 0.5; };
    const numbers = [...card.querySelectorAll('dd')];
    return {
      h1: hero.querySelector('h1').textContent,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      cardInView: inView(card),
      numbersInView: numbers.every(inView),
      numbersNotClipped: numbers.every((dd) => dd.scrollWidth <= dd.clientWidth + 1),
      numbers: numbers.map((d) => d.textContent),
      label: card.querySelector('figcaption').textContent,
      mascot: mascot && { src: mascot.currentSrc.includes('holding-box'), complete: mascot.complete && mascot.naturalWidth > 0, ratio: +(r(mascot).width / r(mascot).height).toFixed(3) },
      ctas: [...hero.querySelectorAll('a')].filter((a) => !a.closest('ul')).map((a) => a.textContent.trim() + '>' + a.getAttribute('href')),
      badges: [...hero.querySelectorAll('ul a')].map((a) => a.getAttribute('href') + '|' + a.getAttribute('aria-label').slice(0, 40)),
      soon: hero.textContent.includes('Mobile apps coming soon'),
      // Visible badge boxes: Apple's file is all badge; Google's has 41/250 clear space on each side.
      badgeBoxes: (() => { const a = r(hero.querySelector('[data-store="appStore"] img')); const g = r(hero.querySelector('[data-store="googlePlay"] img')); const pad = g.height * 41 / 250;
        return { appleH: +a.height.toFixed(1), googleH: +(g.height - 2 * pad).toFixed(1), centerDiff: +Math.abs((a.top + a.height / 2) - (g.top + g.height / 2)).toFixed(1) }; })(),
      ctaAboveFold: r([...hero.querySelectorAll('a')].find((a) => a.textContent.includes('Join early access'))).bottom <= innerHeight,
      cardTop: Math.round(r(card).top), mascotBottom: mascot && Math.round(r(mascot).bottom),
      sideBySide: r(hero.querySelector('h1')).right <= r(card).left + 1 || r(hero.querySelector('h1')).bottom <= r(card).top,
    };
  })()`);
  const tag = `hero ${width}px`;
  check(`${tag}: headline`, h.h1 === "You flip it.We find it.", h.h1);
  check(`${tag}: no horizontal overflow; card and its numbers fully visible`, !h.overflowX && h.cardInView && h.numbersInView && h.numbersNotClipped, JSON.stringify({ overflowX: h.overflowX, cardInView: h.cardInView, numbers: h.numbers }));
  check(`${tag}: card labelled illustrative`, h.label.startsWith("Illustrative example"), h.label);
  check(`${tag}: approved mascot loaded as the priority image, not stretched`, !!h.mascot && h.mascot.src && h.mascot.complete && Math.abs(h.mascot.ratio - 775 / 1024) < 0.02, JSON.stringify(h.mascot));
  check(`${tag}: CTAs -> waitlist / how it works`, h.ctas.join(",") === "Join early access>#waitlist,See how it works>#how-it-works", h.ctas.join(","));
  check(`${tag}: store badges coming soon -> waitlist`, h.soon && h.badges.length === 2 && h.badges.every((b) => b.startsWith("#waitlist|")), h.badges.join(" ; "));
  check(`${tag}: badges the same visible height, aligned`, Math.abs(h.badgeBoxes.appleH - h.badgeBoxes.googleH) <= 1 && h.badgeBoxes.centerDiff <= 1, JSON.stringify(h.badgeBoxes));
  check(`${tag}: primary CTA visible without scrolling`, h.ctaAboveFold);
  await shot(`hero-${width}`);
  if (mobile) {
    // Below the fold on phones: the mascot + sample card.
    await evaluate(`document.querySelector('#hero figure').scrollIntoView({ block: 'end' })`); await sleep(300);
    await shot(`hero-${width}-visual`);
  }
}

// ---- Marketplace gallery (Landing 08) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  await evaluate(`document.getElementById('marketplaces').scrollIntoView()`); await sleep(400);
  const tag = `gallery ${width}px`;
  const read = () => evaluate(`(() => {
    const s = document.getElementById('marketplaces');
    // checkVisibility() also honours content-visibility (how a closed <details> hides its content).
    const visible = (el) => el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
    const tiles = [...s.querySelectorAll('li')].filter(visible);
    const imgs = [...s.querySelectorAll('img')].filter(visible);
    return {
      pills: [...s.querySelectorAll('[data-status]')].filter(visible).map((p) => p.textContent),
      starting: [...s.querySelectorAll('ul')][0].querySelectorAll('li').length,
      visibleTiles: tiles.length,
      open: s.querySelector('details').open,
      summary: s.querySelector('summary').textContent.trim(),
      logos: imgs.map((i) => ({ src: i.getAttribute('src').split('/').pop(), ok: i.complete && i.naturalWidth > 0, ratio: +(i.getBoundingClientRect().width / i.getBoundingClientRect().height).toFixed(2), natural: +(i.naturalWidth / i.naturalHeight).toFixed(2) })),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      footnote: s.textContent.includes("isn't affiliated with or endorsed by them"),
    };
  })()`);
  let g = await read();
  check(`${tag}: nothing labelled Live or Beta`, !g.pills.some((p) => /^(Live|Beta)$/.test(p)), g.pills.join(","));
  check(`${tag}: 2 launch targets + 4 coming soon shown, 11 exploring hidden behind "See more"`, g.starting === 2 && g.visibleTiles === 6 && g.pills.filter((p) => p === "Launch target").length === 3 /* 2 tiles + legend */ && g.pills.filter((p) => p === "Coming soon / Exploring").length === 5 && g.pills.filter((p) => p === "Exploring").length === 1 /* legend only */ && !g.open && g.summary === "See 11 more we're exploring", JSON.stringify({ starting: g.starting, tiles: g.visibleTiles, pills: g.pills.length, open: g.open, summary: g.summary }));
  check(`${tag}: no horizontal overflow`, !g.overflowX);
  await shot(`gallery-${width}-closed`);
  // Open with the keyboard: focus the summary, press Enter.
  await evaluate(`document.querySelector('#marketplaces summary').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(300);
  // Lazy logos load when near the viewport: bring each into view, then wait (bounded) until loaded.
  await evaluate(`(async () => { const imgs = [...document.querySelectorAll('#marketplaces img')]; for (const i of imgs) { i.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 60)); }
    const start = Date.now(); while (!imgs.every((i) => i.complete) && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 100)); })()`);
  g = await read();
  check(`${tag}: Enter on "See more" opens it; all 17 marketplaces then listed`, g.open && g.visibleTiles === 17, JSON.stringify({ open: g.open, tiles: g.visibleTiles }));
  check(`${tag}: 13 official logos loaded, none distorted`, g.logos.length === 13 && g.logos.every((l) => l.ok && Math.abs(l.ratio - l.natural) < 0.06), JSON.stringify(g.logos.filter((l) => !l.ok || Math.abs(l.ratio - l.natural) >= 0.06)));
  check(`${tag}: no horizontal overflow when expanded; trademark note present`, !g.overflowX && g.footnote);
  await shot(`gallery-${width}-open`);
}
// ---- Problem (Landing 09) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  await evaluate(`document.getElementById('problem').scrollIntoView()`); await sleep(400);
  const tag = `problem ${width}px`;
  const pr = await evaluate(`(() => {
    const s = document.getElementById('problem');
    const r = (el) => el.getBoundingClientRect();
    const [before, after] = s.querySelectorAll('article');
    const imgs = [...s.querySelectorAll('[role="img"]')];
    const inside = (el) => { const b = r(el); return b.left >= -1 && b.right <= innerWidth + 1; };
    return {
      heading: s.querySelector('h2').textContent,
      titles: [...s.querySelectorAll('h3')].map((h) => h.textContent),
      layout: r(before).right <= r(after).left ? 'side-by-side' : r(before).bottom <= r(after).top ? 'stacked' : 'overlap',
      illustrations: imgs.map((i) => ({ label: (i.getAttribute('aria-label') || '').startsWith('Illustration:'), hiddenInside: [...i.children].every((c) => c.getAttribute('aria-hidden') === 'true') })),
      allInside: [...s.querySelectorAll('article, [role="img"], [role="img"] > *')].every(inside),
      points: [...s.querySelectorAll('article > ul')].map((u) => u.children.length),
      // The heads-up overlaps the Hunt card's bottom padding only - never the marketplace row.
      sourcesClear: (() => { const card = s.querySelector('article:last-of-type [role="img"] > div'); const rows = [...card.children]; const last = rows[rows.length - 1]; return r(last).bottom <= r(card.nextElementSibling).top + 0.5; })(),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  check(`${tag}: headline + before / after titles`, pr.heading === "Great flips don't wait for your next refresh." && pr.titles.join("|") === "BeforeWithout Rein Drop|AfterWith a saved Hunt", `${pr.heading} / ${pr.titles.join("|")}`);
  check(`${tag}: ${mobile ? "stacked" : "side by side"}`, pr.layout === (mobile ? "stacked" : "side-by-side"), pr.layout);
  check(`${tag}: both illustrations summarised for screen readers, decoration hidden`, pr.illustrations.length === 2 && pr.illustrations.every((i) => i.label && i.hiddenInside), JSON.stringify(pr.illustrations));
  check(`${tag}: heads-up never covers the Hunt card's content`, pr.sourcesClear);
  check(`${tag}: three points per side; nothing off-screen; no horizontal overflow`, pr.points.join(",") === "3,3" && pr.allInside && !pr.overflowX, JSON.stringify({ points: pr.points, allInside: pr.allInside, overflowX: pr.overflowX }));
  await shot(`problem-${width}`);
  if (mobile) { await evaluate(`document.querySelectorAll('#problem article')[1].scrollIntoView()`); await sleep(300); await shot(`problem-${width}-after`); }
}
// ---- How it works (Landing 10) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  await evaluate(`document.getElementById('how-it-works').scrollIntoView()`); await sleep(300);
  await evaluate(`(async () => { const i = document.querySelector('#how-it-works img[src*="running-box"]'); i.scrollIntoView({ block: 'center' }); const s = Date.now(); while (!i.complete && Date.now() - s < 5000) await new Promise((r) => setTimeout(r, 100)); })()`);
  const tag = `how-it-works ${width}px`;
  const hw = await evaluate(`(() => {
    const s = document.getElementById('how-it-works');
    const r = (el) => el.getBoundingClientRect();
    const steps = [...s.querySelectorAll('ol > li')];
    const connectors = [...s.querySelectorAll('ol > li > span[aria-hidden="true"]')];
    const between = connectors.map((c, i) => { const a = r(steps[i]), b = r(steps[i + 1]), k = r(c);
      return ${mobile} ? (k.top >= a.bottom - 1 && k.bottom <= b.top + 12) : (k.left >= a.right - 12 && k.right <= b.left + 12); });
    const img = s.querySelector('img[src*="running-box"]');
    return {
      list: s.querySelector('ol') !== null && steps.length,
      titles: steps.map((li) => li.querySelector('h3').textContent),
      connectors: connectors.length, between,
      layout: steps.length === 3 && Math.abs(r(steps[0]).top - r(steps[2]).top) < 2 ? 'row' : r(steps[0]).bottom <= r(steps[1]).top ? 'column' : 'other',
      figures: [...s.querySelectorAll('figure[role="img"]')].map((f) => (f.getAttribute('aria-label') || '').startsWith('Illustration:')),
      mascot: img && { src: img.currentSrc.includes('running-box'), ok: img.complete && img.naturalWidth > 0, ratio: +(r(img).width / r(img).height).toFixed(2) },
      decide: s.querySelector('aside').textContent.includes('never buys anything for you'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  check(`${tag}: ordered list of the three steps with "Step n of 3" for screen readers`, hw.list === 3 && hw.titles.join("|") === "Step 1 of 3: Tell us what you want|Step 2 of 3: Rein Drop keeps looking|Step 3 of 3: You check promising deals", hw.titles.join("|"));
  check(`${tag}: ${mobile ? "column" : "row"} layout; 2 decorative connectors sitting between the steps`, hw.layout === (mobile ? "column" : "row") && hw.connectors === 2 && hw.between.every(Boolean), JSON.stringify({ layout: hw.layout, connectors: hw.connectors, between: hw.between }));
  check(`${tag}: illustrations summarised; approved running mascot loaded undistorted`, hw.figures.length === 3 && hw.figures.every(Boolean) && hw.mascot && hw.mascot.src && hw.mascot.ok && Math.abs(hw.mascot.ratio - 1024 / 957) < 0.03, JSON.stringify(hw.mascot));
  check(`${tag}: "you decide" note; no horizontal overflow`, hw.decide && !hw.overflowX);
  await evaluate(`document.getElementById('how-it-works').scrollIntoView()`); await sleep(400);
  await shot(`how-${width}`);
  if (mobile) { await evaluate(`document.querySelectorAll('#how-it-works ol > li')[1].scrollIntoView()`); await sleep(300); await shot(`how-${width}-steps`); }
}
// ---- Deal intelligence (Landing 11) ----
for (const [width, height, mobile] of [[1280, 900, false], [1024, 768, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  await evaluate(`document.getElementById('intelligence').scrollIntoView()`); await sleep(400);
  const tag = `intelligence ${width}px`;
  const di = await evaluate(`(() => {
    const s = document.getElementById('intelligence');
    const r = (el) => el.getBoundingClientRect();
    const card = s.querySelector('figure');
    const dts = [...card.querySelectorAll('dt')].map((d) => d.textContent);
    const dds = [...card.querySelectorAll('dd')];
    const GREEN = 'rgb(22, 166, 106)';
    const green = [...s.querySelectorAll('*')].filter((el) => { const c = getComputedStyle(el); return c.color === GREEN || c.backgroundColor === GREEN; }).map((el) => el.tagName + ':' + el.textContent.trim().slice(0, 12));
    return {
      label: card.querySelector('figcaption').textContent,
      photo: (() => { const i = card.querySelector('img[src*="playstation-5"]'); return i && { alt: i.alt, ok: i.complete && i.naturalWidth > 0, fit: getComputedStyle(i).objectFit, tag: card.textContent.includes('Example photo') }; })(),
      dts, numbers: dds.map((d) => d.textContent),
      numbersOk: dds.every((d) => d.scrollWidth <= d.clientWidth + 1 && r(d).right <= innerWidth),
      green,
      netProfit: /net profit/i.test(document.body.textContent),
      notes: [...s.querySelectorAll('ol > li h3')].map((h) => h.textContent),
      layout: r(card).right <= r(s.querySelector('ol')).left ? 'side-by-side' : r(card).bottom <= r(s.querySelector('ol')).top ? 'stacked' : 'other',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  check(`${tag}: labelled illustrative; real example photo (alt + tag), loaded, cropped not stretched`, di.label.startsWith("Illustrative example") && !!di.photo && di.photo.alt.startsWith("Example photo:") && di.photo.ok && di.photo.fit === "cover" && di.photo.tag, JSON.stringify(di.photo));
  check(`${tag}: asking / Estimate-tagged resale / gross upside, numbers fully visible`, di.dts.join("|") === "Asking price|Est. resale Estimate|Potential gross upside 3" && di.numbers.join(",") === "$300,$420,+$120" && di.numbersOk, JSON.stringify({ dts: di.dts, numbers: di.numbers, ok: di.numbersOk }));
  check(`${tag}: green used once (the upside), no "net profit" anywhere`, di.green.length === 1 && di.green[0] === "DD:+$120" && !di.netProfit, JSON.stringify(di.green));
  check(`${tag}: three notes; ${width >= 1000 ? "side by side" : "stacked"}; no horizontal overflow`, di.notes.join("|") === "Why it was flagged|Questions to ask the seller|Before you count it as profit" && di.layout === (width >= 1000 ? "side-by-side" : "stacked") && !di.overflowX, JSON.stringify({ layout: di.layout, overflowX: di.overflowX }));
  await shotAt("#intelligence", `intelligence-${width}`);
  if (mobile) { await shotAt("#intelligence figure", `intelligence-${width}-card`); await shotAt("#intelligence ol", `intelligence-${width}-notes`); }
}
// ---- Hunts + alerts (Landing 12) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  await evaluate(`document.getElementById('hunts').scrollIntoView()`); await sleep(400);
  const tag = `hunts+alerts ${width}px`;
  const ha = await evaluate(`(() => {
    const r = (el) => el.getBoundingClientRect();
    const h = document.getElementById('hunts'), a = document.getElementById('alerts');
    const shot = h.querySelector('[role="img"]'), phone = a.querySelector('[role="img"]');
    const interactive = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable]';
    const marks = [...shot.querySelectorAll('img')];
    return {
      huntsHeading: h.querySelector('h2').textContent,
      caption: h.querySelector('figcaption').textContent,
      shotLabel: (shot.getAttribute('aria-label') || '').includes('not a working form'),
      controlsInsideIllustration: shot.querySelectorAll(interactive).length + phone.querySelectorAll(interactive).length,
      huntsLinks: [...h.querySelectorAll('a')].map((x) => x.textContent.trim() + '>' + x.getAttribute('href')),
      marks: marks.length > 0 && marks.every((i) => i.complete && i.naturalWidth > 0),
      alertsHeading: a.querySelector('h2').textContent,
      phoneLabel: (phone.getAttribute('aria-label') || '').startsWith('Illustration:'),
      email: /e-?mail/i.test(a.textContent),
      alertsText: a.textContent,
      points: [...a.querySelectorAll('ul > li strong')].map((s) => s.textContent),
      caveat: a.textContent.includes('not advice to buy'),
      huntsLayout: r(h.querySelector('div > div')).right <= r(h.querySelector('figure')).left ? 'side' : 'stacked',
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  check(`${tag}: hunts copy + 'illustration, not a working form' label`, ha.huntsHeading === "Your budget. Your area. Your kind of flip." && ha.caption === "Example Hunt - illustration, not a working form" && ha.shotLabel, `${ha.huntsHeading} / ${ha.caption}`);
  check(`${tag}: no controls inside the illustrations; the only hunts action is the waitlist link`, ha.controlsInsideIllustration === 0 && ha.huntsLinks.length === 1 && ha.huntsLinks[0] === "Join early access to create your first Hunt>#waitlist", JSON.stringify({ controls: ha.controlsInsideIllustration, links: ha.huntsLinks }));
  check(`${tag}: official marks loaded in the illustration`, ha.marks);
  // Tested here in Node: a regex inside the page template would lose its backslashes.
  const clock = /\b\d{1,2}:\d{2}\b|\bnow\b|\bago\b/i.test(ha.alertsText);
  check(`${tag}: alerts copy, phone summarised, push + in-app points, no email, no clock / 'now'`, ha.alertsHeading === "Get a heads-up when something worth checking drops." && ha.phoneLabel && ha.points.join("|") === "Push notifications|In-app alerts|You choose|One alert per deal" && !ha.email && !clock && ha.caveat, JSON.stringify({ email: ha.email, clock, points: ha.points }));
  check(`${tag}: ${mobile ? "stacked" : "side by side"}; no horizontal overflow`, ha.huntsLayout === (mobile ? "stacked" : "side") && !ha.overflowX, JSON.stringify({ layout: ha.huntsLayout, overflowX: ha.overflowX }));
  await shotAt("#hunts", `hunts-${width}`);
  await shotAt("#alerts", `alerts-${width}`);
  if (mobile) { await shotAt("#hunts figure", `hunts-${width}-screen`); await shotAt("#alerts ul", `alerts-${width}-points`); }
}
// ---- Outcomes, FAQ, closing CTA, footer (Landing 13) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true], [320, 640, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  const tag = `landing13 ${width}px`;
  const l = await evaluate(`(() => {
    const r = (el) => el.getBoundingClientRect();
    const o = document.getElementById('outcomes'), f = document.getElementById('faq'), w = document.getElementById('waitlist'), foot = document.querySelector('footer');
    const GREEN = 'rgb(22, 166, 106)';
    const greens = [...o.querySelectorAll('*')].filter((el) => getComputedStyle(el).color === GREEN);
    const result = o.querySelector('ol > li:last-child');
    const ids = new Set([...document.querySelectorAll('[id]')].map((el) => el.id));
    const inPage = [...document.querySelectorAll('a[href^="#"], a[href^="/#"]')].map((a) => a.getAttribute('href').split('#')[1]);
    const details = [...f.querySelectorAll('details')];
    const input = w.querySelector('input'), button = w.querySelector('button');
    return {
      cards: [...o.querySelectorAll('ol > li h3')].map((h) => h.textContent),
      label: o.textContent.includes('Illustrative example'),
      profit: result.textContent.includes('+$63'),
      outcomesText: o.textContent,
      greensInResult: greens.length > 0 && greens.every((el) => result.contains(el)),
      faq: details.map((d) => d.querySelector('h3').textContent), firstOpen: details[0].open, othersClosed: details.slice(1).every((d) => !d.open),
      faqText: f.textContent,
      waitHeading: w.querySelector('h2').textContent,
      formReady: !input.disabled && button.type === 'submit' && !!w.querySelector('#waitlist-consent') && !w.textContent.includes('Sign-up opens here soon'),
      inputLabelled: !!document.querySelector('label[for="' + input.id + '"]'),
      contrast: getComputedStyle(w.querySelector('h2')).color + ' on ' + getComputedStyle(w.firstElementChild).backgroundColor,
      waitBadges: [...w.querySelectorAll('[data-store]')].map((a) => a.getAttribute('href')),
      footLegal: [...foot.querySelectorAll('a[href^="/privacy"], a[href^="/terms"]')].map((a) => a.getAttribute('href')),
      footReview: (foot.textContent.match(/Draft - needs legal review/g) || []).length,
      footContact: foot.textContent.includes('Contact details coming soon') && foot.textContent.includes('Needs review'),
      footTrademark: foot.textContent.includes('not affiliated with or endorsed by them'),
      footText: foot.textContent,
      deadLinks: inPage.filter((id) => !ids.has(id)),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  // Text checks run here in Node (regexes inside the page template would lose their backslashes).
  const outcomes = l.outcomesText.replace(/\s+/g, " ");
  const compare = /Estimated upside when you found it: \+\$120 \(gross, before costs\)/.test(outcomes) && /What you actually made: \+\$63/.test(outcomes);
  check(`${tag}: Bought -> Sold -> Actual profit, illustrative, estimate (+$120 gross) vs actual (+$63)`, l.cards.join("|") === "Bought|Sold|Actual profit" && l.label && l.profit && compare, JSON.stringify({ cards: l.cards, compare }));
  check(`${tag}: outcomes green only on the result`, l.greensInResult);
  const faqClean = !/\b20\d\d\b|\$\d/.test(l.faqText);
  check(`${tag}: FAQ has the 7 questions, first open, no dates or prices`, l.faq.length === 7 && l.faq[0] === "What is a Hunt?" && l.firstOpen && l.othersClosed && faqClean, l.faq.join(" | "));
  check(`${tag}: waitlist CTA - white on navy, live form with consent (Landing 20), labelled input, badges -> waitlist`, l.waitHeading === "Spend less time searching. More time flipping." && l.formReady && l.inputLabelled && l.contrast === "rgb(255, 255, 255) on rgb(18, 35, 63)" && l.waitBadges.length === 2 && l.waitBadges.every((h) => h === "#waitlist"), JSON.stringify({ contrast: l.contrast, badges: l.waitBadges }));
  check(`${tag}: footer - legal drafts marked for review, contact placeholder marked, trademark line, no pricing`, l.footLegal.join(",") === "/privacy,/terms" && l.footReview === 2 && l.footContact && l.footTrademark && !/\$\d/.test(l.footText), JSON.stringify({ legal: l.footLegal, review: l.footReview }));
  check(`${tag}: no dead in-page links; no horizontal overflow`, l.deadLinks.length === 0 && !l.overflowX, JSON.stringify({ dead: l.deadLinks, overflowX: l.overflowX }));
  await shotAt("#outcomes", `outcomes-${width}`);
  await shotAt("#faq", `faq-${width}`);
  await shotAt("#waitlist", `waitlist-${width}`);
  await shotAt("footer", `footer-${width}`);
}
// FAQ opens with the keyboard.
await viewport(1280, 900, false); await load(`${base}/`);
await evaluate(`document.querySelectorAll('#faq summary')[2].focus()`);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await sleep(300);
check("FAQ: Enter opens a question", await evaluate(`document.querySelectorAll('#faq details')[2].open`));
// Legal placeholders exist, say they're drafts and stay out of search.
for (const path of ["/privacy", "/terms"]) {
  await load(`${base}${path}`);
  const lp = await evaluate(`({ status: document.querySelector('main p')?.textContent, robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'), h1: document.querySelector('h1')?.textContent, footer: !!document.querySelector('footer') })`);
  check(`${path}: draft marked "Draft - requires legal review", noindex, with footer`, lp.status === "Draft - requires legal review" && /noindex/.test(lp.robots || "") && !!lp.h1 && lp.footer, JSON.stringify(lp));
}
// ---- Example product photos (step 60b) ----
for (const [width, height, mobile] of [[1280, 900, false], [375, 812, true]]) {
  await viewport(width, height, mobile);
  await load(`${base}/`);
  // Bring every photo near the viewport so lazy ones load, then wait (bounded).
  await evaluate(`(async () => { const imgs = [...document.querySelectorAll('img[src*="assets%2Fphotos"], img[src*="/assets/photos/"]')]; for (const i of imgs) { i.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 80)); }
    const s = Date.now(); while (!imgs.every((i) => i.complete) && Date.now() - s < 5000) await new Promise((r) => setTimeout(r, 100)); })()`);
  const rawPhotos = await evaluate(`[...document.querySelectorAll('img[src*="assets%2Fphotos"], img[src*="/assets/photos/"]')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, fit: getComputedStyle(i).objectFit }))`);
  // File names extracted here in Node (a regex inside the page template would lose its backslashes).
  const photos = rawPhotos.map((ph) => ({ ...ph, src: decodeURIComponent(ph.src).match(/photos\/([\w-]+)/)?.[1] }));
  // Distinct files: the demo (Landing 15) shows the iPhone and PS5 photos again.
  const names = [...new Set(photos.map((ph) => ph.src))].sort().join(",");
  check(`photos ${width}px: all 5 example photos load, cropped (object-fit: cover) not stretched`, names === "iphone-13-pro-sierra-blue,iphone-listing-1,iphone-listing-2,iphone-listing-3,playstation-5" && photos.every((ph) => ph.ok && ph.fit === "cover"), JSON.stringify(photos));
}
const credits = await evaluate(`(() => { const f = document.querySelector('footer'); return { text: f.textContent.includes('Example product photos from Unsplash'), links: [...f.querySelectorAll('a[href*="unsplash.com/@"]')].length }; })()`);
check("footer credits Unsplash and each photographer", credits.text && credits.links === 5, JSON.stringify(credits));
// Nav "Features" lands on deal intelligence.
await viewport(1280, 800, false); await load(`${base}/`);
await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="#intelligence"]').click()`); await settleScroll();
const features = await evaluate(`({ hash: location.hash, focus: document.activeElement.id, top: Math.round(document.getElementById('intelligence').getBoundingClientRect().top) })`);
check("nav 'Features' scrolls to deal intelligence and focuses it", features.hash === "#intelligence" && features.focus === "intelligence" && features.top >= 0 && features.top <= 96, JSON.stringify(features));
// The hero's "See how it works" lands here (scroll + focus).
await viewport(1280, 800, false); await load(`${base}/`);
await evaluate(`[...document.querySelectorAll('#hero a')].find((a) => a.textContent.includes('See how it works')).click()`); await settleScroll();
const landed = await evaluate(`({ hash: location.hash, top: Math.round(document.getElementById('how-it-works').getBoundingClientRect().top) })`);
check("hero 'See how it works' scrolls to the section", landed.hash === "#how-it-works" && landed.top >= 0 && landed.top <= 96, JSON.stringify(landed));
// Hero card shows the official Facebook mark.
await viewport(1280, 800, false); await load(`${base}/`);
const heroMark = await evaluate(`(() => { const i = document.querySelector('#hero figure img[src*="facebook"]'); return i && { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, text: document.querySelector('#hero figure').textContent.includes('Facebook Marketplace') }; })()`);
check("hero card: official Facebook mark + name", !!heroMark && heroMark.src.endsWith("facebook.webp") && heroMark.ok && heroMark.text, JSON.stringify(heroMark));

// ---- Hunt demo (Landing 15) ----
const demoInfo = () => evaluate(`(() => { const d = document.getElementById('demo'); const h = d.querySelector('h3'); const bar = d.querySelector('[role="progressbar"]');
  return { label: [...d.querySelectorAll('p')].some((p) => p.textContent.trim() === 'Illustrative demo — not live listings' && p.getBoundingClientRect().width > 0),
    heading: h && h.textContent, focusIsHeading: document.activeElement === h, current: d.querySelector('[aria-current="step"]')?.textContent ?? null,
    live: d.querySelector('[aria-live="polite"]')?.textContent ?? null, progress: bar && Number(bar.getAttribute('aria-valuenow')),
    statuses: [...d.querySelectorAll('ol[aria-label="Example listings"] li')].map((li) => li.dataset.status + (li.dataset.best ? '*' : '')),
    buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()), text: d.textContent,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth }; })()`);
const clickDemo = async (start) => { await evaluate(`[...document.querySelectorAll('#demo button, #demo a')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(start)})).click()`); await sleep(150); };
const waitHeading = (text, ms = 6000) => evaluate(`(async () => { const s = Date.now(); while (document.querySelector('#demo h3')?.textContent !== ${JSON.stringify(text)} && Date.now() - s < ${ms}) await new Promise((r) => setTimeout(r, 25)); return Date.now() - s; })()`);
const pressKey = async (k, code, text) => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k, windowsVirtualKeyCode: code, ...(text && type === "keyDown" ? { text } : {}) }); await sleep(150); };
/** Screenshot of the whole demo frame (page coordinates, so it doesn't depend on the scroll position). */
const shotDemo = async (name) => {
  await sleep(350);
  const r = await evaluate(`(() => { const b = document.getElementById('demo').querySelector(':scope > div > div').getBoundingClientRect(); return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height }; })()`);
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...r, scale: 1 } })).data, "base64"));
};
await viewport(1280, 900, false); await load(`${base}/`);
await evaluate(`document.getElementById('demo').scrollIntoView()`); await sleep(400);
let d = await demoInfo();
check("demo: obvious 'Illustrative demo — not live listings' label, 4-step progress at 'Product', 3 products", d.label && d.heading === "What should Rein Drop hunt for?" && (d.current ?? "").includes("Product") && ["iPhone 13 Pro", "PlayStation 5", "MacBook Air M2"].every((n) => d.buttons.some((b) => b.startsWith(n))), JSON.stringify({ label: d.label, heading: d.heading, current: d.current, buttons: d.buttons }));
await shotDemo("demo-1-choose-1280");
await clickDemo("PlayStation 5"); await sleep(350);
d = await demoInfo();
check("demo: choosing a product -> 'Hunt' step, focus on the new heading, Back + Start over shown", d.heading === "Set up your PlayStation 5 Hunt" && d.focusIsHeading && (d.current ?? "").includes("Hunt") && d.buttons.includes("Back to products") && d.buttons.includes("Start over"), JSON.stringify({ heading: d.heading, focus: d.focusIsHeading, current: d.current }));
await shotDemo("demo-2-configure-1280");
await clickDemo("Start the scan");
d = await demoInfo();
check("demo: scan starts at 0 of 4 and is announced politely", d.heading === "Checking example listings for PlayStation 5" && d.progress === 0 && d.live === "Checking 4 example listings. This takes a couple of seconds.", JSON.stringify({ heading: d.heading, progress: d.progress, live: d.live }));
await sleep(600);
d = await demoInfo();
check("demo: progress advances one listing at a time", d.progress >= 1 && d.progress < 4 && d.statuses.some((s) => s === "checking"), JSON.stringify({ progress: d.progress, statuses: d.statuses }));
await shotDemo("demo-3-scan-1280");
const scanMs = await waitHeading("Best match found");
d = await demoInfo();
const firstAnnouncement = d.live;
check("demo: fast - the scan ends in about 2 s with the best match marked, focus on its heading", scanMs < 2500 && d.focusIsHeading && d.progress === 4 && d.statuses.join(",") === "skip,skip,match*,match", JSON.stringify({ ms: scanMs + 750, statuses: d.statuses, focus: d.focusIsHeading }));
check("demo: result announced (fits, best match, estimated gross upside)", d.live === "Scan finished: 2 of 4 example listings fit your Hunt. Best match: PlayStation 5 console + 1 controller, good condition, asking $300, estimated gross upside +$120.", d.live);
await sleep(600); await shotDemo("demo-4-candidate-1280");
await clickDemo("See why it was flagged"); await sleep(350);
d = await demoInfo();
const joinHref = await evaluate(`[...document.querySelectorAll('#demo a')].find((a) => a.textContent.includes('Join early access'))?.getAttribute('href')`);
check("demo: deal explanation - strength, estimate, gross upside, why / questions / costs, 'not profit', CTA to the waitlist", d.heading === "Why this deal was flagged" && d.focusIsHeading && (d.current ?? "").includes("Deal") && ["Strong deal", "Estimate", "+$120", "Why it was flagged", "Questions to ask the seller", "Before you count it as profit", "It is not profit."].every((t) => d.text.includes(t)) && joinHref === "#waitlist", JSON.stringify({ heading: d.heading, current: d.current, joinHref }));
await sleep(400); await shotDemo("demo-5-evaluation-1280");
await clickDemo("Back to the match"); await sleep(300);
d = await demoInfo();
check("demo: Back from the deal returns to the match", d.heading === "Best match found" && d.focusIsHeading, d.heading);
await clickDemo("Start over"); await sleep(300);
d = await demoInfo();
check("demo: Start over returns to the products, focus on the heading", d.heading === "What should Rein Drop hunt for?" && d.focusIsHeading && !d.buttons.includes("Start over"), JSON.stringify({ heading: d.heading, focus: d.focusIsHeading }));

// Keyboard only: Enter on a product, Home on the price slider -> nothing fits -> back keeps the setting.
await evaluate(`[...document.querySelectorAll('#demo button')].find((b) => b.textContent.startsWith('MacBook Air M2')).focus()`);
await pressKey("Enter", 13, "\r"); await sleep(300);
d = await demoInfo();
check("demo (keyboard): Enter on a product opens its Hunt", d.heading === "Set up your MacBook Air M2 Hunt", d.heading);
await evaluate(`document.getElementById('demo-max-price').focus()`);
await pressKey("Home", 36);
const minPrice = await evaluate(`document.getElementById('demo-max-price').value`);
await clickDemo("Start the scan");
await waitHeading("Nothing fits this Hunt yet");
d = await demoInfo();
check("demo: a too-tight Hunt ends in 'nothing fits', announced, with a way back", d.heading === "Nothing fits this Hunt yet" && d.live === "Scan finished: none of the 4 example listings fit your Hunt. Go back to change it." && d.buttons.includes("Change the Hunt"), JSON.stringify({ heading: d.heading, live: d.live, minPrice }));
await clickDemo("Change the Hunt"); await sleep(300);
const keptPrice = await evaluate(`document.getElementById('demo-max-price').value`);
check("demo: going back keeps the Hunt settings", keptPrice === minPrice && minPrice === "300", `${minPrice} -> ${keptPrice}`);

// Skip, and determinism: the same choices give the same result.
await clickDemo("Start over"); await clickDemo("PlayStation 5"); await clickDemo("Start the scan"); await clickDemo("Skip to the result");
const skipMs = await waitHeading("Best match found", 2000);
d = await demoInfo();
check("demo: 'Skip to the result' finishes at once, with the same result as before (deterministic)", skipMs < 300 && d.live === firstAnnouncement, `${skipMs} ms`);

// Phone width.
await viewport(375, 812, true); await load(`${base}/`);
await evaluate(`document.getElementById('demo').scrollIntoView()`); await sleep(300);
await clickDemo("iPhone 13 Pro"); await clickDemo("Start the scan"); await clickDemo("Skip to the result"); await waitHeading("Best match found", 2000);
await clickDemo("See why it was flagged"); await sleep(500);
d = await demoInfo();
check("demo 375px: works through to the deal, no horizontal overflow", d.heading === "Why this deal was flagged" && !d.overflowX && d.label, JSON.stringify({ heading: d.heading, overflowX: d.overflowX }));
await shotDemo("demo-5-evaluation-375");

// ---- Marketplace requests -> waitlist form (Landing 17) ----
const interestInfo = () => evaluate(`(() => {
  const g = document.getElementById('marketplaces'); const w = document.getElementById('waitlist');
  const req = [...g.querySelectorAll('button[aria-label^="Request "]')];
  return { requestable: req.map((b) => b.getAttribute('aria-label').slice(8)), pressed: req.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label').slice(8)),
    other: g.querySelector('button[aria-pressed]:not([aria-label])')?.getAttribute('aria-pressed') ?? null,
    summary: g.querySelector('[aria-live="polite"]')?.textContent ?? null,
    chips: [...w.querySelectorAll('form [role="group"] li')].map((li) => li.textContent.trim()), otherInput: !!w.querySelector('#waitlist-other-marketplace'),
        addSelect: !!w.querySelector('#waitlist-add-marketplace'),
    waitText: w.textContent, galleryText: g.textContent,
    resources: performance.getEntriesByType('resource').length, fetches: performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest').length,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`);
const clickSel = async (expr) => { await evaluate(`(${expr}).click()`); await sleep(150); };
const reqButton = (name) => `document.querySelector('#marketplaces button[aria-label="Request ${name}"]')`;
/** Screenshot of one element in page coordinates (works at the very bottom of the page too). */
const shotEl = async (selector, name) => { await sleep(300); const r = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + scrollX - 16, y: b.top + scrollY - 16, width: b.width + 32, height: b.height + 32 }; })()`); writeFileSync(path.join(outDir, `${name}.png`), Buffer.from((await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...r, scale: 1 } })).data, "base64")); };

await viewport(1280, 900, false); await load(`${base}/`);
let mi = await interestInfo();
const launchNames = ["eBay", "Facebook Marketplace"];
check("requests: every 'on our radar' marketplace has a Request toggle; launch targets don't", mi.requestable.length === 15 && launchNames.every((n) => !mi.requestable.includes(n)) && mi.pressed.length === 0 && mi.other === "false", JSON.stringify(mi.requestable));
check("requests: nothing picked -> no summary; the waitlist form points back to the list", mi.summary === "" && mi.chips.length === 0 && mi.waitText.includes("marketplace list") && mi.addSelect, JSON.stringify({ summary: mi.summary }));
const before = mi.fetches;
await clickSel(reqButton("Mercari"));
await clickSel(reqButton("OfferUp"));
await clickSel(`document.querySelector('#marketplaces details summary')`);
await clickSel(reqButton("Vinted"));
// Keyboard: Space on "Other".
await evaluate(`document.querySelector('#marketplaces button[aria-pressed]:not([aria-label])').focus()`);
await pressKey(" ", 32, " ");
mi = await interestInfo();
check("requests: toggles (mouse + keyboard Space) show pressed; the visitor's own summary is announced", mi.pressed.join(",") === "OfferUp,Mercari,Vinted" && mi.other === "true" && mi.summary === "4 picked - added to your early-access sign-up below.", JSON.stringify({ pressed: mi.pressed, other: mi.other, summary: mi.summary }));
await shotAt("#marketplaces h3 + p", "requests-gallery-1280");
check("requests: carried into the waitlist form in gallery order, with Other's name field", mi.chips.join(",") === "OfferUp,Mercari,Vinted,Other" && mi.otherInput, JSON.stringify(mi.chips));
await evaluate(`document.getElementById('waitlist-other-marketplace').focus()`);
await send("Input.insertText", { text: "Kijiji" }); await sleep(150);
mi = await interestInfo();
check("requests: Other's name is typed in the form (sent with the sign-up - Landing 20)", (await evaluate(`document.getElementById('waitlist-other-marketplace').value`)) === "Kijiji", "");
check("requests: picking sends nothing (only the sign-up does)", mi.fetches === before, JSON.stringify({ fetches: [before, mi.fetches] }));
const honest = (t) => !/\bvotes?\b|\d+\s+(people|resellers|others|requests)|we'll add|will launch/i.test(t);
check("requests: no vote totals or delivery promises in the gallery or the form", honest(mi.galleryText) && honest(mi.waitText) && mi.waitText.includes("don't guarantee a marketplace will be added"), "");
await shotEl("#waitlist form", "requests-waitlist-1280");
// Removing in the form updates the gallery (one shared state).
await clickSel(`document.querySelector('#waitlist button[aria-label="Remove Mercari"]')`);
await clickSel(`document.querySelector('#waitlist button[aria-label="Remove Other"]')`);
mi = await interestInfo();
check("requests: removing in the form un-picks in the gallery (shared state); Other's name is dropped", mi.pressed.join(",") === "OfferUp,Vinted" && mi.other === "false" && !mi.otherInput, JSON.stringify({ pressed: mi.pressed }));
await clickSel(`[...document.querySelectorAll('#marketplaces button')].find((b) => b.textContent.trim() === 'Clear picks')`);
mi = await interestInfo();
check("requests: Clear picks empties both", mi.pressed.length === 0 && mi.chips.length === 0 && mi.summary === "", JSON.stringify({ pressed: mi.pressed, chips: mi.chips }));
// Client state only: gone after a reload, nothing in browser storage.
await clickSel(reqButton("Etsy"));
await load(`${base}/`);
mi = await interestInfo();
const stored = await evaluate(`({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie })`);
check("requests: client state only - gone after a reload, nothing stored in the browser", mi.pressed.length === 0 && mi.chips.length === 0 && stored.local.length === 0 && stored.session.length === 0 && !/etsy|market/i.test(stored.cookie), JSON.stringify(stored));
// Phone width.
await viewport(375, 812, true); await load(`${base}/`);
await clickSel(reqButton("Craigslist")); await clickSel(reqButton("Poshmark"));
await clickSel(`document.querySelector('#marketplaces button[aria-pressed]:not([aria-label])')`);
mi = await interestInfo();
check("requests 375px: picks carried, no horizontal overflow", mi.chips.join(",") === "Craigslist,Poshmark,Other" && !mi.overflowX, JSON.stringify({ chips: mi.chips, overflowX: mi.overflowX }));
await shotEl("#waitlist form", "requests-waitlist-375");

// ---- One waitlist form for every CTA + legal drafts (Landing 20) ----
const formInfo = () => evaluate(`(() => {
  const w = document.getElementById('waitlist'); const a = document.activeElement;
  return { focus: a ? (a.id || a.getAttribute('role') || a.tagName) : null,
    emailError: document.getElementById('waitlist-email-error')?.textContent ?? null, emailInvalid: document.getElementById('waitlist-email')?.getAttribute('aria-invalid') ?? null,
    consentError: document.getElementById('waitlist-consent-error')?.textContent ?? null,
    alert: w.querySelector('form [role="alert"]:not(p)')?.textContent ?? null,
    retry: [...w.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Try again'),
    busy: w.querySelector('form')?.getAttribute('aria-busy') ?? null, button: w.querySelector('button[type="submit"]')?.textContent.trim() ?? null,
    success: w.querySelector('[role="status"]')?.textContent ?? null, successFocused: a?.getAttribute('role') === 'status',
    mascot: (() => { const i = w.querySelector('[role="status"] img'); return i ? i.complete && i.naturalWidth > 0 && i.getAttribute('src').includes('thumbs-up') : null; })(),
    sent: window.__sent ?? [], text: w.textContent,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
})()`);
/** Replace fetch for /api/waitlist in the page: record bodies, answer with `mode` (status | 'throw' | 'slow:<status>'). */
const stubWaitlist = (mode) => evaluate(`(() => {
  window.__realFetch = window.__realFetch || window.fetch; window.__sent = window.__sent || [];
  window.fetch = async (url, init) => {
    if (!String(url).includes('/api/waitlist')) return window.__realFetch(url, init);
    window.__sent.push(JSON.parse(init.body));
    const mode = ${JSON.stringify(mode)};
    if (mode === 'throw') throw new TypeError('Failed to fetch');
    if (String(mode).startsWith('slow:')) { await new Promise((r) => setTimeout(r, 800)); return new Response(JSON.stringify({ status: 'received' }), { status: Number(mode.slice(5)) }); }
    const bodies = { 202: { status: 'received' }, 429: { status: 'error', code: 'RATE_LIMITED' }, 503: { status: 'error', code: 'UNAVAILABLE' } };
    return new Response(JSON.stringify(bodies[mode] || {}), { status: mode });
  };
})()`);
const typeEmail = async (value) => { await evaluate(`(() => { const i = document.getElementById('waitlist-email'); i.focus(); i.select(); })()`); if (value) await send("Input.insertText", { text: value }); else for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }); await sleep(100); };
const submitForm = async () => { await evaluate(`document.querySelector('#waitlist button[type="submit"]').click()`); await sleep(250); };

await viewport(1280, 900, false); await load(`${base}/`);
const ctas = await evaluate(`[...document.querySelectorAll('a')].filter((a) => a.textContent.includes('Join early access') || a.textContent.includes('early-access sign-up') || a.hasAttribute('data-store')).map((a) => a.getAttribute('href'))`);
check("form: every Join early access / coming-soon badge / sign-up link leads to the one form (#waitlist)", ctas.length >= 7 && ctas.every((h) => h === "#waitlist"), JSON.stringify(ctas));
await evaluate(`[...document.querySelectorAll('#hero a')].find((a) => a.textContent.includes('Join early access')).click()`); await settleScroll();
await pressKey("Tab", 9);
let fi = await formInfo();
check("form: hero CTA lands on the waitlist; the next Tab is the email field", fi.focus === "waitlist-email", JSON.stringify({ focus: fi.focus }));
const trap = await evaluate(`(() => { const i = document.getElementById('waitlist-website'); const r = i.getBoundingClientRect(); return { tab: i.tabIndex, hidden: i.closest('[aria-hidden="true"]') !== null, offscreen: r.right < 0, displayed: getComputedStyle(i).display !== 'none' }; })()`);
check("form: honeypot is off-screen (not display:none), out of the tab order and hidden from screen readers", trap.tab === -1 && trap.hidden && trap.offscreen && trap.displayed, JSON.stringify(trap));
// Validation, before anything is sent.
await stubWaitlist(202);
await submitForm();
fi = await formInfo();
check("form: empty email -> message next to the field, announced, focus on the field; nothing sent", fi.emailError === "Enter your email address" && fi.emailInvalid === "true" && fi.focus === "waitlist-email" && fi.sent.length === 0, JSON.stringify({ e: fi.emailError, focus: fi.focus }));
await typeEmail("not-an-email"); await submitForm();
fi = await formInfo();
check("form: invalid email -> specific message", (fi.emailError ?? "").startsWith("Enter a valid email address") && fi.sent.length === 0, fi.emailError);
await typeEmail("sam@example.com"); await submitForm();
fi = await formInfo();
check("form: consent is required - unticked box -> message, focus on the box; nothing sent", fi.consentError === "Tick the box to agree before joining" && fi.focus === "waitlist-consent" && fi.sent.length === 0, JSON.stringify({ c: fi.consentError, focus: fi.focus }));
// Optional marketplace from the form's own select + consent; slow answer shows the loading state.
await evaluate(`(() => { const s = document.getElementById('waitlist-add-marketplace'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'mercari'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
await evaluate(`document.getElementById('waitlist-consent').click()`); await sleep(100);
await stubWaitlist("slow:202");
await evaluate(`document.querySelector('#waitlist button[type="submit"]').click()`); await sleep(150);
const loading = await formInfo();
await evaluate(`document.querySelector('#waitlist button[type="submit"]')?.click()`); // a second press while busy is ignored
await sleep(1100);
fi = await formInfo();
check("form: loading state (busy, 'Joining…'), a second press doesn't send twice", loading.busy === "true" && loading.button === "Joining…" && fi.sent.length === 1, JSON.stringify({ busy: loading.busy, button: loading.button, sent: fi.sent.length }));
check("form: sends email, consent version, source, the picked marketplace and the empty honeypot", JSON.stringify(fi.sent[0]) === JSON.stringify({ email: "sam@example.com", source: "landing_waitlist_form", requestedMarketplaces: ["mercari"], requestedMarketplaceOther: null, consentVersion: "2026-10-12", website: "" }), JSON.stringify(fi.sent[0]));
check("form: success - confirmation announced and focused, approved thumbs-up mascot, no repeat-or-new hint", !!fi.success && fi.success.includes("You're on the early-access list.") && fi.successFocused && fi.mascot === true && !/already/i.test(fi.success), JSON.stringify({ s: fi.success, focused: fi.successFocused, mascot: fi.mascot }));
await shotEl("#waitlist", "form-success-1280");
const cleared = await evaluate(`[...document.querySelectorAll('#marketplaces button[aria-pressed="true"]')].length`);
check("form: after joining, the marketplace picks are cleared", cleared === 0, String(cleared));

// Errors + retry.
await load(`${base}/`);
await stubWaitlist("throw");
await typeEmail("sam@example.com"); await evaluate(`document.getElementById('waitlist-consent').click()`); await submitForm(); await sleep(200);
fi = await formInfo();
check("form: offline -> announced error, Try again, contact path (placeholder until CONTACT_EMAIL is set)", (fi.alert ?? "").includes("couldn't reach Rein Drop") && fi.retry && fi.text.includes("Contact details coming soon"), fi.alert);
await shotEl("#waitlist form", "form-error-1280");
await stubWaitlist(202);
await evaluate(`[...document.querySelectorAll('#waitlist button')].find((b) => b.textContent.trim() === 'Try again').click()`); await sleep(400);
fi = await formInfo();
check("form: Try again resends the same sign-up and succeeds", !!fi.success && fi.sent.length === 2 && JSON.stringify(fi.sent[0]) === JSON.stringify(fi.sent[1]), String(fi.sent.length));
await load(`${base}/`);
await stubWaitlist(429);
await typeEmail("sam@example.com"); await evaluate(`document.getElementById('waitlist-consent').click()`); await submitForm(); await sleep(200);
fi = await formInfo();
check("form: rate limited -> 'wait a few minutes', no Try again button", (fi.alert ?? "").includes("wait a few minutes") && !fi.retry, fi.alert);
// The real route (owner's API has no database right now): a safe 503 'try again', email kept in the field.
await load(`${base}/`);
await typeEmail("landing20.check@example.com"); await evaluate(`document.getElementById('waitlist-consent').click()`); await submitForm(); await sleep(2500);
fi = await formInfo();
const kept = await evaluate(`document.getElementById('waitlist-email')?.value`);
check("form (real route, API without database): 'couldn't save' + Try again; the email stays in the field", (fi.alert ?? "").includes("couldn't save your sign-up") && fi.retry && kept === "landing20.check@example.com", JSON.stringify({ alert: fi.alert, kept }));
// Phone width.
await viewport(375, 812, true); await load(`${base}/`);
await stubWaitlist(503);
await typeEmail("sam@example.com"); await evaluate(`document.getElementById('waitlist-consent').click()`); await submitForm(); await sleep(200);
fi = await formInfo();
check("form 375px: error state fits, no horizontal overflow", (fi.alert ?? "").length > 0 && !fi.overflowX, JSON.stringify({ overflowX: fi.overflowX }));
await shotEl("#waitlist form", "form-error-375");

// Legal drafts: conspicuous status, open points, contact path, out of search.
for (const [path, width] of [["/privacy", 1280], ["/terms", 1280], ["/privacy", 375]]) {
  await viewport(width, 900, width < 500); await load(`${base}${path}`);
  const lg = await evaluate(`(() => { const b = document.querySelector('main [role="note"]'); const r = b?.getBoundingClientRect();
    return { banner: b?.textContent ?? null, bg: b && getComputedStyle(b).backgroundColor, top: r && Math.round(r.top), h1: document.querySelector('h1')?.textContent, version: [...document.querySelectorAll('main p')].some((p) => /^Version \\d{4}-\\d{2}-\\d{2} \\(draft\\)$/.test(p.textContent)),
      toConfirm: [...document.querySelectorAll('main p')].filter((p) => p.textContent === 'To be confirmed').length, contact: document.querySelector('#legal-contact')?.parentElement.textContent ?? '',
      robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'), text: document.querySelector('main').textContent, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth }; })()`);
  const promise = lg.text.replace(/doesn't guarantee|not a promise|No system is completely secure/g, "");
  check(`${path} ${width}px: conspicuous draft banner at the top (yellow), version, 'To be confirmed' points, contact path, noindex`, (lg.banner ?? "").startsWith("Draft - requires legal review") && lg.bg === "rgb(255, 248, 217)" && lg.top < 200 && lg.version && lg.toConfirm >= 1 && lg.contact.includes("Contact details coming soon") && /noindex/.test(lg.robots || "") && !lg.overflowX, JSON.stringify({ banner: lg.banner?.slice(0, 40), bg: lg.bg, top: lg.top, version: lg.version, toConfirm: lg.toConfirm, robots: lg.robots }));
  check(`${path} ${width}px: no unsupported guarantees on the page`, !/guarantee|promise|100%|completely secure|will never/i.test(promise), "");
  await shot(`legal${path.replace("/", "-")}-${width}`);
}

// ---- Motion (Landing 16) ----
await viewport(1280, 900, false);
await send("Page.navigate", { url: `${base}/` }); await sleep(250);
const early = await evaluate(`(() => {
  const anims = (sel) => { const el = document.querySelector(sel); return el ? el.getAnimations().map((a) => ({ name: a.animationName, iterations: a.effect.getTiming().iterations, opacity: a.effect.getKeyframes().some((k) => 'opacity' in k) })) : null; };
  return { headline: anims('#hero h1'), lead: anims('#hero h1 + p'), mascot: anims('#hero img[src*="holding-box"]'), card: anims('#hero figure') };
})()`);
check("motion: hero copy and deal card animate in on load", early.lead?.length === 1 && early.lead[0].opacity && early.card?.length === 1 && early.card[0].opacity, JSON.stringify({ lead: early.lead, card: early.card }));
check("motion: headline and mascot only move - never start invisible (LCP stays fast)", early.headline?.length === 1 && !early.headline[0].opacity && early.mascot?.length >= 1 && early.mascot.every((a) => !a.opacity), JSON.stringify({ headline: early.headline, mascot: early.mascot }));
check("motion: the mascot's motion is one-time (no endless loop)", early.mascot?.every((a) => Number.isFinite(a.iterations)), JSON.stringify(early.mascot));
await sleep(3000);
const settled = await evaluate(`(() => {
  const time = document.getAnimations().filter((a) => a.timeline === document.timeline);
  const card = getComputedStyle(document.querySelector('#hero figure'));
  const mascot = getComputedStyle(document.querySelector('#hero img[src*="holding-box"]'));
  return { running: time.filter((a) => a.playState === 'running').map((a) => a.animationName ?? 'js'), infinite: document.getAnimations().filter((a) => a.effect.getTiming().iterations === Infinity).length,
    card: card.opacity + ' ' + card.transform, mascot: mascot.transform };
})()`);
const atRest = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
check("motion: everything settles within 3 s; nothing on the page loops forever", settled.running.length === 0 && settled.infinite === 0 && settled.card.startsWith("1 ") && atRest(settled.card.slice(2)) && atRest(settled.mascot), JSON.stringify(settled));
const scrollMotion = await evaluate(`(() => { const supported = CSS.supports('animation-timeline: view()');
  const tl = (sel) => document.querySelector(sel).getAnimations().map((a) => a.timeline && a.timeline.constructor.name);
  return { supported, howMascot: tl('#how-it-works img[src*="running-box"]'), intelCard: tl('#intelligence figure') }; })()`);
check("motion: running mascot and deal-intelligence card enter with the scroll (scroll-driven, where supported)", !scrollMotion.supported || (scrollMotion.howMascot.join() === "ViewTimeline" && scrollMotion.intelCard.join() === "ViewTimeline"), JSON.stringify(scrollMotion));
// The page scrolls smoothly: wait until scrolling has stopped before reading the card.
await evaluate(`document.getElementById('intelligence').scrollIntoView()`); await settleScroll(); await sleep(150);
const intel = await evaluate(`(() => { const s = getComputedStyle(document.querySelector('#intelligence figure')); return s.opacity + ' ' + s.transform; })()`);
check("motion: once in view, the deal-intelligence card is fully shown", /^1 (none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(intel), intel);
// Only partly scrolled in: it is part-way through its entrance (tied to the scroll, not a timer).
await evaluate(`(() => { const r = document.querySelector('#intelligence figure').getBoundingClientRect(); document.documentElement.style.scrollBehavior = 'auto'; window.scrollBy(0, r.top - innerHeight + 120); document.documentElement.style.scrollBehavior = ''; })()`); await sleep(200);
const partly = await evaluate(`Number(getComputedStyle(document.querySelector('#intelligence figure')).opacity)`);
check("motion: part-way into view, the card is part-way through its entrance", partly > 0 && partly < 1, String(partly));
await evaluate(`document.getElementById('demo').scrollIntoView()`); await sleep(300);
await clickDemo("iPhone 13 Pro");
const stage = await evaluate(`(() => { const s = document.querySelector('#demo h3 + div'); return s.getAnimations().map((a) => a.animationName); })()`);
check("motion: a demo stage change fades the new stage in", stage.length === 1, JSON.stringify(stage));

// Reduced motion: no animations at all, and the demo scan finishes at once.
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await send("Page.navigate", { url: `${base}/` }); await sleep(250);
const still = await evaluate(`({ hero: ['#hero h1', '#hero h1 + p', '#hero figure', '#hero img[src*="holding-box"]'].flatMap((s) => document.querySelector(s).getAnimations()).length,
  scroll: ['#how-it-works img[src*="running-box"]', '#intelligence figure'].flatMap((s) => document.querySelector(s).getAnimations()).length,
  card: getComputedStyle(document.querySelector('#hero figure')).opacity })`);
check("reduced motion: no hero reveal, no mascot motion, no scroll entrances; card shown at once", still.hero === 0 && still.scroll === 0 && still.card === "1", JSON.stringify(still));
await sleep(1000);
await evaluate(`document.getElementById('demo').scrollIntoView()`); await sleep(200);
await clickDemo("PlayStation 5");
const stillStage = await evaluate(`document.querySelector('#demo h3 + div').getAnimations().length`);
await clickDemo("Start the scan");
const reducedMs = await waitHeading("Best match found", 2000);
check("reduced motion: no demo stage animation; the scan shows its result at once", stillStage === 0 && reducedMs < 300, JSON.stringify({ stillStage, reducedMs }));
await send("Emulation.setEmulatedMedia", { features: [] });

console.log(results.join("\n"));
console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
ws.close(); chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
