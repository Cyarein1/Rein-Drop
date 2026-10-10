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
      formDisabled: input.disabled && button.disabled && w.textContent.includes('Sign-up opens here soon'),
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
  check(`${tag}: waitlist CTA - white on navy, form shown disabled with a note, labelled input, badges -> waitlist`, l.waitHeading === "Spend less time searching. More time flipping." && l.formDisabled && l.inputLabelled && l.contrast === "rgb(255, 255, 255) on rgb(18, 35, 63)" && l.waitBadges.length === 2 && l.waitBadges.every((h) => h === "#waitlist"), JSON.stringify({ contrast: l.contrast, badges: l.waitBadges }));
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
  check(`${path}: placeholder marked "Draft - requires legal review", noindex, with footer`, lp.status === "Draft - requires legal review" && /noindex/.test(lp.robots || "") && !!lp.h1 && lp.footer, JSON.stringify(lp));
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
  const names = photos.map((ph) => ph.src).sort().join(",");
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

console.log(results.join("\n"));
console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
ws.close(); chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
