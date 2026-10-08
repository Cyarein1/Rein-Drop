/**
 * Semantic mascot tokens - Mascot Usage Guide v1.0, section 10
 * (`brand.mascot.<token>`). UI state chooses a token; each app maps tokens to
 * approved files in @rein-drop/brand-assets. Tokens without an approved asset
 * map to null and render nothing - never substitute invented artwork.
 *
 * Usage rules (guide sections 1 and 7): only where the product is communicating
 * something; never on every card, dense analytics, routine CRUD, serious
 * errors/payment failures, or as a substitute for status text.
 */
export const MASCOT_TOKENS = [
  'welcome', // wave / happy
  'confirmed', // thumbs up
  'working', // loading / working
  'waiting', // sitting / leaning on box
  'afterHours', // sleeping / resting
  'suggestion', // looking / thinking
  'analysis', // inspecting / magnifier
  'exceptionalDeal', // surprised / exclamation
  'success', // celebrating
  'profit', // success / profit
  'cancellation', // sad / empty
  'inventory', // holding / carrying box
] as const;

export type MascotToken = (typeof MASCOT_TOKENS)[number];

/**
 * Product states -> mascot token. Screens ask for a STATE; this map picks the semantic token and
 * each app maps tokens to approved files (or a neutral placeholder when none is approved yet -
 * see docs/ASSET_TODO.md). Never reference image files from product code.
 */
export const PRODUCT_STATE_MASCOTS = {
  /** Brand-new account, first welcome. */
  welcome: 'welcome',
  /** Something was saved / confirmed. */
  confirmed: 'confirmed',
  /** A Hunt's first scan is running. */
  firstScan: 'working',
  /** A Hunt is live and healthy but nothing has matched yet. */
  noDealsYet: 'waiting',
  /** Monitoring is intentionally reduced (quiet hours / plan cadence). */
  reducedMonitoring: 'afterHours',
  /** One actionable Hunt / plan suggestion. */
  suggestion: 'suggestion',
  /** Plan cancellation (soften, never guilt). */
  cancellation: 'cancellation',
  /** Inventory is empty (purchase tracking education). */
  emptyInventory: 'inventory',
} as const satisfies Record<string, MascotToken>;
export type ProductState = keyof typeof PRODUCT_STATE_MASCOTS;
