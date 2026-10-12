"use client";

import { useEffect } from "react";

/**
 * Pairs with `content-visibility: auto` on the landing sections (landing.module.css, Landing 23).
 * Skipping off-screen sections cut first-paint layout work, but a skipped section only has an
 * estimated height - so a scroll to something further down (nav link, CTA, /#faq on arrival) would
 * land in the wrong place. This renders the sections ahead of time, off the critical path:
 * - after load, one section per idle period (small chunks, no long task);
 * - at once before any in-page link is followed, or when the page opens on a #hash.
 * Renders nothing.
 */
export function RenderAhead({ mainId }: { mainId: string }) {
  useEffect(() => {
    const main = document.getElementById(mainId);
    if (!main) return;
    const sections = [...main.querySelectorAll<HTMLElement>(":scope > section")].slice(1);
    const renderAll = () => {
      for (const s of sections) s.dataset.rendered = "";
    };

    // In-page links: capture phase, so it runs before the browser (or the nav) scrolls.
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('a[href^="#"], a[href^="/#"]')) renderAll();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", renderAll);
    if (location.hash) renderAll();

    // The rest, one section per idle period (Safari has no requestIdleCallback: small timeouts).
    const idle = window.requestIdleCallback ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 } as IdleDeadline), 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    let i = 0;
    let handle = 0;
    const step = () => {
      while (i < sections.length && sections[i]!.dataset.rendered !== undefined) i++;
      if (i < sections.length) {
        sections[i++]!.dataset.rendered = "";
        handle = idle(step, { timeout: 2000 });
      }
    };
    const start = () => {
      handle = idle(step, { timeout: 2000 });
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", renderAll);
      window.removeEventListener("load", start);
      cancel(handle);
    };
  }, [mainId]);
  return null;
}
