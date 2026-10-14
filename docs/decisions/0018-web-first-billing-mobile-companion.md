# 0018 - Web-first billing, mobile companion apps

- **Status:** Accepted (2026-10-14) by the product owner ("Rein Drop - Web-first billing & mobile
  companion strategy"). Implemented in phases A-E (below).
- **Progress:** tracked in [strategy/WEB_FIRST_COMPANION.md](../strategy/WEB_FIRST_COMPANION.md) -
  the strategy verbatim, the phase tracker and the change log.
- **Builds on:** [0003](0003-plans-entitlements-placeholders.md) (plans and entitlements),
  [0014](0014-stripe-web-billing.md) (Stripe web billing). It **replaces** D2's default ("the app
  sells nothing") with a stricter one: the app doesn't *mention* buying at all.

## Decision

Rein Drop is a **web-first SaaS** with **lightweight mobile companion apps**:

- **Web** is the full platform: marketing, pricing, sign-up, onboarding, advanced Hunts,
  analytics, inventory, billing (checkout, plan changes, cancellation), account and security.
- **Mobile (iOS / Android)** is a free, focused companion:
  - sign-in;
  - deals with their full economics, plus alerts and push;
  - Hunts (view, basic controls, simple create);
  - inventory (purchase tracking);
  - account and notification settings.

  It runs on the same account, backend, data and entitlements.
- **One subscription relationship**, bought and managed on the web, never tied to a device. The
  backend is the only authority on access.

## Owner choices (2026-10-14)

| Topic | Choice |
|---|---|
| Mobile navigation | **Deals** (with the alerts inbox), **Hunts** (with Create), **Inventory**, **Account**. Home dashboard and Analytics become web-only. |
| Limit / no-access copy on mobile | **Neutral**, e.g. "Your current access includes 1 live Hunt. Pause another to watch this one." Optionally a plain "You can manage your account at {site}" with no purchase wording. That line sits **behind a flag, off by default, until the app-store review** (regional rules differ). Never prices, plan comparisons, "upgrade", checkout links or a WebView checkout. |
| Product families | **Modelled now:** plans belong to a family - Source (active), Sell and Complete (inactive, invisible). Current Free / Pro / Ultimate become Source plans. |
| Stripe `unpaid` | **No paid access.** `past_due` keeps access while Stripe retries (D36); once Stripe marks it `unpaid`, paid features stop. Hunts above the Free limit pause; nothing is deleted. |

## Not an exemption claim

This is the preferred product design, not a claim that the apps are automatically exempt from
App Store / Google Play payment rules. Before public release, review Apple's rules for free
companion / "reader"-style apps, Google Play's payments policy and regional rules (phase E). If
review requires a different flow, it is implemented as a separately approved, region-specific
change - never by quietly bypassing store rules.

## Phases

- **A. Backend access is authoritative:**
  - the worker never monitors a Hunt whose owner lacks access;
  - Hunts above the limit are paused when a paid period ends without a webhook (scheduled
    check), and when Free is chosen;
  - `unpaid` means no paid access;
  - lifecycle tests.
- **B. Mobile billing-free:**
  - no prices, plan picker, upgrade CTAs or "subscribe on the web" copy;
  - "Start watching" activates within current access;
  - neutral limit / no-access messages;
  - the account line behind a flag.
- **C. Mobile navigation:** Deals / Hunts / Inventory / Account; Home and Analytics web-only.
- **D. Product families + feature flags:** a family on Plan, family-scoped entitlement keys, and a
  small server-driven feature-flag mechanism for unfinished features (Sell).
- **E. Compliance review notes, deep-link / push re-check, launch checklist.**

## Still open (OUTSTANDING)

- Trials and a billing grace policy beyond Stripe's retries (no fields today).
- Analytics-history and seat limits are not enforced on the backend.
- Teams and workspaces (B-03).
- A web pricing page (the landing says pricing isn't final - D3).
- The Sell workspace and photo capture.
