"use client";

import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { landingImages } from "../landing-assets";
import { NAV_LINKS, PRIMARY_CTA, type LandingSectionId } from "../sections";
import { DESKTOP_NAV_QUERY, isScrolled, menuKeyAction } from "./menu-focus";
import styles from "./SiteNav.module.css";

const WORDMARK_HEIGHT = 30;
const wordmark = landingImages.wordmark;

/**
 * Landing navigation (Landing 06). Sticky but quiet: transparent over the top of the page, a light
 * frosted bar with a hairline once you scroll. Desktop shows the links inline; below 900 px a
 * compact bar (wordmark, Join early access, menu button) opens a panel. Every link is an in-page
 * anchor; the CTA goes to the waitlist section for now.
 *
 * Menu accessibility: the button reports aria-expanded / aria-controls; opening moves focus to the
 * first link; Tab / Shift+Tab stay inside the menu; Escape or the button closes it and returns
 * focus to the button; following a link, clicking outside or widening to desktop closes it.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Solid bar only after a real scroll (rAF-throttled, passive listener).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(isScrolled(window.scrollY));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () => [toggleRef.current, ...Array.from(panel?.querySelectorAll<HTMLElement>("a[href]") ?? [])].filter((el): el is HTMLElement => el !== null);
    focusables()[1]?.focus();

    // The page behind doesn't scroll while the menu covers it.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      const items = focusables();
      const action = menuKeyAction(event.key, event.shiftKey, items.indexOf(document.activeElement as HTMLElement), items.length);
      if (!action) return;
      event.preventDefault();
      if (action.type === "close") close(true);
      else items[action.index]?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel?.contains(target) && !toggleRef.current?.contains(target)) close(false);
    };
    const desktop = window.matchMedia(DESKTOP_NAV_QUERY);
    const onViewport = () => {
      if (desktop.matches) close(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    desktop.addEventListener("change", onViewport);
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      desktop.removeEventListener("change", onViewport);
    };
  }, [open, close]);

  /** In-page link: let the browser scroll, then move focus to the section so keyboard and screen-reader users land there too. */
  const goTo = (section: LandingSectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (open) close(false);
    requestAnimationFrame(() => document.getElementById(section)?.focus({ preventScroll: true }));
  };

  return (
    <header className={styles.bar} data-scrolled={scrolled || undefined} data-open={open || undefined}>
      <div className={styles.inner}>
        <a href="#hero" className={styles.brand} aria-label="Rein Drop - back to top" onClick={goTo("hero")}>
          <Image
            src={wordmark.src}
            width={Math.round((wordmark.width / wordmark.height) * WORDMARK_HEIGHT)}
            height={WORDMARK_HEIGHT}
            alt=""
            priority
            sizes={`${Math.round((wordmark.width / wordmark.height) * WORDMARK_HEIGHT)}px`}
          />
        </a>

        <nav aria-label="Main" className={styles.desktopNav}>
          <ul className={styles.links}>
            {NAV_LINKS.map((link) => (
              <li key={link.section}>
                <a href={`#${link.section}`} className={styles.link} onClick={goTo(link.section)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <a href="/sign-in" className={styles.signIn}>
            Sign in
          </a>
          <a href={`#${PRIMARY_CTA.section}`} className={styles.cta} onClick={goTo(PRIMARY_CTA.section)}>
            {PRIMARY_CTA.label}
          </a>
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => (open ? close(true) : setOpen(true))}
          >
            {open ? <X aria-hidden size={22} /> : <Menu aria-hidden size={22} />}
            <span className="visually-hidden">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      <div ref={panelRef} id={panelId} className={styles.panel} hidden={!open}>
        <nav aria-label="Main menu">
          <ul className={styles.panelLinks}>
            {NAV_LINKS.map((link) => (
              <li key={link.section}>
                <a href={`#${link.section}`} className={styles.panelLink} onClick={goTo(link.section)}>
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/sign-in" className={styles.panelLink}>
                Sign in
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
