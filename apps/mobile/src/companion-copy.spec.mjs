import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { de, en } from '@rein-drop/i18n';
import { describe, expect, it } from 'vitest';

/**
 * (Plain JS so the app's TypeScript config needs no Node types.)
 * Decision 0018: the mobile apps are companions and never sell. This scans every screen / component
 * for selling words in user-facing text and for billing calls, so a later change can't quietly add a
 * price, an "upgrade" button or "subscribe on the web" back. Plans and billing are web-only.
 * Screen text lives in the shared catalogs (packages/i18n/src/messages, docs/i18n/README.md), so the
 * English AND German messages the app can show are scanned too.
 */
const SRC = path.dirname(fileURLToPath(import.meta.url));
/** @param {string} dir @returns {string[]} */
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !/(\.spec|-test|\.d)\.tsx?$/.test(name) ? [full] : [];
  });

/** String literals and JSX text only (comments and identifiers may name billing concepts). */
/** @param {string} source @returns {string[]} */
function userFacingText(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const literals = [...withoutComments.matchAll(/'([^'\\\n]{3,})'|"([^"\\\n]{3,})"|`([^`]{3,})`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
  const jsxText = [...withoutComments.matchAll(/>\s*([^<>{}\n][^<>{}]{2,}?)\s*</g)].map((m) => m[1] ?? '');
  return [...literals, ...jsxText].filter((t) => /[a-z]{3,}\s+[a-z]/i.test(t)); // sentences, not keys / class names
}

// "Purchase" alone is a reseller's stock purchase (inventory) - only subscription purchases count.
const SELLING = /\b(upgrade|subscribe|unlock|go premium|start (?:a |your )?free trial|restore purchases?|in-app purchase|purchase (?:a |the )?(?:plan|subscription)|buy (?:a|the) (?:plan|subscription)|pricing|price tbd|per month|\/ month|checkout|choose a plan|bigger plan|see plans|change plan|cancel plan|manage billing|billing is managed|on the web)\b/i;

/**
 * German selling words, mirroring SELLING (and client-core SELLING_WORDS_DE): plan buying, upgrades,
 * subscriptions, price lists, monthly prices, checkout, "on the web". The reseller's own stock is
 * fine ("Kaufpreis", "gekauft", "verkaufen", "Angebotspreis"), as is the neutral glossary term
 * "kostenpflichtige Funktionen".
 */
const SELLING_DE =
  /(\bupgrad\w*|\babonn\w*|\babos?\b|\bfreischalt\w*|\bpremium\b|\btestversion\b|\bkäufe wiederherstellen\b|\bin-app-kauf\w*|\b(?:tarif|plan|abo)\w* (?:kaufen|buchen|abschließen)\b|\bpreisliste\b|\bpreisübersicht\b|\bpro monat\b|\/\s?monat\b|\bmonatlich\b|\bcheckout\b|\b(?:tarif|plan)\w* (?:wählen|ansehen|vergleichen|ändern|wechseln|kündigen)\b|\bgrößere[nmrs]? (?:tarif|plan)\w*|\bjetzt kaufen\b|\babrechnung verwalten\b|\bim web\b|\bauf der website\b|\bwebseite\b)/i;

/** Catalog areas only the web app shows (plans, billing, analytics, Home dashboard). */
const WEB_ONLY_NAMESPACES = ['billing', 'analytics', 'home'];
/** Web-only messages inside shared areas (client-core picks them only for surface "web"; cancellation is web-only). */
const WEB_ONLY_KEYS = { states: /Web$|^(seePlans|seeOptions|backToSettings|keepMyPlan)$|^cancel/ };
/** Reviewed exceptions: the reseller pricing their OWN item, not a plan. */
const ALLOWED = ['inventory.insightFeesCausedLoss'];

/** Every message the companion can show: [key, text], per language. */
/** @param {Record<string, Record<string, string>>} catalog @returns {[string, string][]} */
const companionMessages = (catalog) =>
  Object.entries(catalog)
    .filter(([ns]) => !WEB_ONLY_NAMESPACES.includes(ns))
    .flatMap(([ns, messages]) =>
      Object.entries(messages)
        .filter(([key]) => !(/** @type {Record<string, RegExp>} */ (WEB_ONLY_KEYS)[ns]?.test(key)))
        .map(([key, text]) => /** @type {[string, string]} */ ([`${ns}.${key}`, text])),
    )
    .filter(([key]) => !ALLOWED.includes(key));

describe('mobile companion never sells (decision 0018)', () => {
  const sources = files(SRC).map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, 'utf8') }));

  it('scans the whole app', () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it('no user-facing selling words on any screen', () => {
    const hits = sources.flatMap(({ file, text }) => userFacingText(text).filter((t) => SELLING.test(t)).map((t) => `${file}: "${t.trim().slice(0, 80)}"`));
    expect(hits).toEqual([]);
  });

  it('no selling words in the English or German messages the app can show', () => {
    const english = companionMessages(en);
    const german = companionMessages(de);
    expect(english.length).toBeGreaterThan(300); // the scan sees the catalogs, so it isn't vacuous
    expect(german.length).toBe(english.length);
    expect(english.filter(([, text]) => SELLING.test(text)).map(([key, text]) => `${key}: "${text.slice(0, 80)}"`)).toEqual([]);
    expect(german.filter(([, text]) => SELLING_DE.test(text)).map(([key, text]) => `${key}: "${text.slice(0, 80)}"`)).toEqual([]);
  });

  it("the German guard catches selling words and lets the reseller's own buying and selling through", () => {
    for (const bad of ['Jetzt upgraden', 'Abo abschließen', 'Tarif wählen', '9,99 € pro Monat', 'Zum Checkout', 'Verwalte dein Konto im Web', 'Jetzt kaufen', 'Premium freischalten']) {
      expect(SELLING_DE.test(bad), bad).toBe(true);
    }
    for (const fine of ['Kaufpreis', 'Als gekauft markieren', 'Zum Verkauf einstellen', 'Angebotspreis', 'Kein Zugang zu kostenpflichtigen Funktionen', 'Gekauft', 'verkaufen']) {
      expect(SELLING_DE.test(fine), fine).toBe(false);
    }
    expect(SELLING.test('Upgrade now')).toBe(true);
  });

  it('web-only messages are never used in the app', () => {
    const keys = Object.entries(en).flatMap(([ns, messages]) =>
      Object.keys(messages)
        .filter((key) => WEB_ONLY_NAMESPACES.includes(ns) || /** @type {Record<string, RegExp>} */ (WEB_ONLY_KEYS)[ns]?.test(key))
        .map((key) => `${ns}.${key}`),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(sources.flatMap(({ file, text }) => keys.filter((k) => text.includes(`'${k}'`)).map((k) => `${file}: ${k}`))).toEqual([]);
  });

  it('no billing calls: checkout, portal, plan choice, development billing, plan list', () => {
    const calls = /\.(startCheckout|createCheckout|openBillingPortal|billingPortal|chooseFreePlan|confirmDevBilling|listPlans|getBillingInfo|syncBilling)\(/;
    expect(sources.filter(({ text }) => calls.test(text)).map((s) => s.file)).toEqual([]);
  });

  it('web-only features stay off the companion: no analytics screens, Home dashboard or analytics / home API calls', () => {
    expect(sources.filter(({ file }) => /^app[\\/](analytics|\(tabs\)[\\/]analytics)/.test(file)).map((s) => s.file)).toEqual([]);
    const webOnlyCalls = /\.(getHome|get\w*Analytics\w*|getMissed\w*)\(/;
    expect(sources.filter(({ text }) => webOnlyCalls.test(text)).map((s) => s.file)).toEqual([]);
  });

  it('tabs come from the shared MOBILE_TABS (Deals, Hunts, Inventory, Account), each with a route file', () => {
    const layout = sources.find(({ file }) => /^app[\\/]\(tabs\)[\\/]_layout\.tsx$/.test(file));
    expect(layout?.text).toMatch(/MOBILE_TABS\.map/);
    for (const tab of ['deals', 'hunts', 'inventory', 'account']) {
      expect(sources.some(({ file }) => file.replace(/\\/g, '/') === `app/(tabs)/${tab}.tsx`)).toBe(true);
    }
  });

  it('no purchase SDKs, web views or purchase web pages: nothing can open a checkout inside or outside the app', () => {
    const pkg = JSON.parse(readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => /webview|iap|in-app-purchase|purchases|billing|stripe|revenuecat/i.test(d))).toEqual([]);
    expect(sources.filter(({ text }) => /react-native-webview|<WebView\b/.test(text)).map((s) => s.file)).toEqual([]);
    // The system browser is only for signing in (Entra), never for a web page of Rein Drop's.
    expect(sources.filter(({ file, text }) => /expo-web-browser/.test(text) && !/^auth[\\/]/.test(file)).map((s) => s.file)).toEqual([]);
    // Outbound links open marketplace pages only - a listing to buy, the seller's own listing, or a marketplace's
    // own 'create listing' page (Sell, decision 0019) - never a Rein Drop site, account or payment URL.
    const opens = sources.flatMap(({ file, text }) => [...text.matchAll(/openURL\(([^)]*)\)/g)].map((m) => `${file}: ${m[1]}`));
    expect(opens.length).toBeGreaterThan(0); // the scan sees the listing links, so it isn't vacuous
    expect(opens.filter((o) => !/: (view\.(url|sourceUrl!?)|c\.url!?|c\.assist!?\.openUrl)$/.test(o))).toEqual([]);
    expect(sources.filter(({ text }) => /openURL\([^)]*(ACCOUNT_SITE|accountSiteLine)|https?:\/\/[^'"\s]*reindrop/i.test(text)).map((s) => s.file)).toEqual([]);
  });

  it('the account line is plain text (no link) and only when the build sets EXPO_PUBLIC_ACCOUNT_SITE', () => {
    const uses = sources.filter(({ text }) => /accountSiteLine\(/.test(text));
    for (const { file, text } of uses) {
      // Optionally with the translator (`t`) as the second argument - nothing else.
      expect(text, file).toMatch(/accountSiteLine\(process\.env\.EXPO_PUBLIC_ACCOUNT_SITE(?:, t)?\)/);
      expect(text, file).not.toMatch(/onPress=\{[^}]*accountLine/);
    }
  });

  it('signs in to an existing account: no sign-up / create-account button on mobile', () => {
    const hits = sources.flatMap(({ file, text }) => userFacingText(text).filter((t) => /\b(create an account|sign up|register)\b/i.test(t)).map((t) => `${file}: "${t.trim().slice(0, 80)}"`));
    expect(hits).toEqual([]);
  });

  it('no plan picker, price labels or cancel-plan screen', () => {
    expect(sources.filter(({ text }) => /planGateOptions|priceLabel|cancellationState|cancel-plan|billingStatusView|planCards|checkoutReturnView|syncBilling/.test(text)).map((s) => s.file)).toEqual([]);
  });
});
