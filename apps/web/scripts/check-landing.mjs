// Browser check of the landing page: drives a headless Chrome / Edge over the DevTools protocol -
// no extra dependencies - and asserts the navigation (Landing 06: sticky bar, mobile menu focus /
// Tab wrap / Escape / outside click / resize, in-page links, reduced motion) and the hero
// (Landing 07: layout at 320-1440 px, the sample card never clipped and labelled illustrative,
// CTAs, store badges, priority mascot) and the marketplace gallery (Landing 08: honest statuses,
// expander by mouse and keyboard, official logos loaded undistorted) and the problem section
// (Landing 09: before / after layout, labelled CSS illustrations, nothing off-screen). Screenshots go to <outDir>. Until Playwright is added
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
await evaluate(`document.querySelector('nav[aria-label="Main"] a[href="#faq"]').click()`); await sleep(1200);
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
await evaluate(`[...document.getElementById(document.querySelector('button[aria-controls]').getAttribute('aria-controls')).querySelectorAll('a')].find(a => a.textContent === 'Marketplaces').click()`); await sleep(1200);
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
// Hero card shows the official Facebook mark.
await viewport(1280, 800, false); await load(`${base}/`);
const heroMark = await evaluate(`(() => { const i = document.querySelector('#hero figure img'); return i && { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, text: document.querySelector('#hero figure').textContent.includes('Facebook Marketplace') }; })()`);
check("hero card: official Facebook mark + name", !!heroMark && heroMark.src.endsWith("facebook.webp") && heroMark.ok && heroMark.text, JSON.stringify(heroMark));

console.log(results.join("\n"));
console.log(`${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
ws.close(); chrome.kill();
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
