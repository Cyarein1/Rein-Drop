/**
 * App Store / Google Play links (decision L-D7). The apps aren't published yet, so by default
 * both badges say "Coming soon" and lead to the waitlist. A store URL switches its badge to a real
 * download link - set it in the web app's environment (read on the server when the page is built):
 *
 *   APP_STORE_URL=https://apps.apple.com/...      GOOGLE_PLAY_URL=https://play.google.com/store/apps/details?id=...
 *
 * Only https URLs on the stores' own hosts are accepted, so a typo can't send visitors elsewhere.
 */
export type Store = "appStore" | "googlePlay";

export type StoreLink = { store: Store; status: "available"; href: string } | { store: Store; status: "coming_soon" };

const STORE_HOSTS: Record<Store, string> = { appStore: "apps.apple.com", googlePlay: "play.google.com" };

export function storeLink(store: Store, configured: string | undefined): StoreLink {
  const raw = configured?.trim();
  if (!raw) return { store, status: "coming_soon" };
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && url.hostname === STORE_HOSTS[store]) return { store, status: "available", href: url.toString() };
  } catch {
    // Not a URL - treat as not configured.
  }
  return { store, status: "coming_soon" };
}

export function storeLinks(env: Record<string, string | undefined> = process.env): StoreLink[] {
  return [storeLink("appStore", env.APP_STORE_URL), storeLink("googlePlay", env.GOOGLE_PLAY_URL)];
}
