/**
 * Keyboard behaviour of the mobile menu, as pure functions (unit-tested; the component only wires
 * them to the DOM). The focus cycle is [menu button, ...menu links]: while the menu is open, Tab
 * and Shift+Tab stay inside it and Escape closes it, returning focus to the menu button.
 */
export type MenuKeyAction = { type: "close" } | { type: "focus"; index: number } | null;

export function menuKeyAction(key: string, shiftKey: boolean, activeIndex: number, count: number): MenuKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key !== "Tab" || count === 0) return null;
  // Focus outside the cycle (e.g. on the page behind): bring it back to the start / end.
  if (activeIndex < 0) return { type: "focus", index: shiftKey ? count - 1 : 0 };
  if (!shiftKey && activeIndex === count - 1) return { type: "focus", index: 0 };
  if (shiftKey && activeIndex === 0) return { type: "focus", index: count - 1 };
  return null; // ordinary Tab inside the cycle: let the browser move focus
}

/** The bar gets its background / shadow once the page has scrolled past this many px. */
export const SCROLLED_AFTER_PX = 8;

export const isScrolled = (scrollY: number) => scrollY > SCROLLED_AFTER_PX;

/** Viewport width at which the inline navigation replaces the menu button (keep in sync with SiteNav.module.css). */
export const DESKTOP_NAV_QUERY = "(min-width: 900px)";
