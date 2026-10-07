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
