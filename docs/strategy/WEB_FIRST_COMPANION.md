# Web-first billing & mobile companion - initiative tracker

_Living document, updated with every step of this initiative. Started 2026-10-14 (step 76)._

- **What this is:** the paper trail for the owner's "Web-first billing & mobile companion strategy".
- **Sections:** the idea, the decisions taken, where each phase stands, and a dated log of what
  changed in which step.
- **Related documents:**
  - Decision record: [decisions/0018](../decisions/0018-web-first-billing-mobile-companion.md).
  - Step details: [BUILD_STATUS.md](../BUILD_STATUS.md).
  - Open items: [OUTSTANDING.md](../OUTSTANDING.md), section "Web-first billing & mobile companion".

**Rule:** every step that touches this initiative updates sections 3 and 4 here, in the same step
as the code.

## 1. The idea (summary - full text in the appendix)

- **Web is the full product:**
  - marketing and pricing;
  - sign-up and onboarding;
  - advanced Hunts, analytics and inventory;
  - billing (checkout, plan changes, cancellation);
  - account and security.
- **iOS / Android are free, focused companions:**
  - sign-in;
  - deals with their full economics, alerts and push;
  - Hunts (view, basic controls, simple create);
  - inventory;
  - account and notification settings.
- **Same account, backend, data and entitlements everywhere:** one subscription relationship,
  bought and managed on the web and never tied to a device.
- **Why:**
  - protect operating margins (no unnecessary store commission);
  - serve intentional resellers;
  - keep mobile fast and focused;
  - avoid duplicated logic.
- **The backend is the only authority on access.** Hiding a button in an app is never the
  enforcement.
- **Not an exemption claim:** store payment rules are reviewed before public release (phase E). A
  required change becomes a separately approved, region-specific flow.

**Definition of success:**
1. A reseller finds Rein Drop on the web and subscribes there.
2. They set up Hunts on the web.
3. They download the free app and sign into the same account.
4. They get alerts and evaluate deals on the phone.
5. They see the same Hunts, inventory and data on both.
6. They manage billing on the web.

## 2. Decisions

| Date | Decision | Where |
|---|---|---|
| 2026-10-15 | Mobile tab bar keeps the central "+" Create (owner; reverses the step 78 Hunts-header placement) | Step 83 |
| 2026-10-15 | Sell workspace open to every account and marketplace during beta; eBay mock publishing, Facebook assisted; photos from anywhere, any as cover | Decision 0019 |
| 2026-10-14 | Mobile signs in to an **existing** account only: the "Create an account" button was removed (in-app account creation would bring Apple's in-app account-deletion requirement; accounts are created on the web). Entra hosted page sign-up link: release review (A3) | MOBILE_ACCOUNT_ACCESS.md (step 81) |
| 2026-10-14 | Strategy adopted: web-first SaaS + mobile companion | Decision 0018 |
| 2026-10-14 | Mobile tabs: **Deals** (with alerts inbox), **Hunts** (with Create), **Inventory**, **Account**. Home dashboard and Analytics web-only | Decision 0018 |
| 2026-10-14 | Limit / no-access copy on mobile is **neutral**. An optional "You can manage your account at {site}" line (no purchase wording) sits behind a flag, **off until the store review** | Decision 0018 |
| 2026-10-14 | **Product families** Source / Sell / Complete modelled now; only Source active, nothing of Sell visible | Decision 0018 |
| 2026-10-14 | Stripe **`unpaid` = no paid access** (past due keeps access while Stripe retries - D36) | Decision 0018 |
| 2026-10-14 | Billing grace period: **configurable, default 0 days** until the owner sets a policy; never after the user's own cancellation | ACCESS_RULES.md (step 79) |
| Earlier | Stripe is the web billing provider; plans Free / Pro / Ultimate with placeholder limits | Decisions 0014, 0003 |

## 3. Phase tracker

| Phase | What | Status | Step |
|---|---|---|---|
| Audit | Inspect what exists vs the strategy | **Done** - findings below | 76 |
| A | Backend is authoritative on access: shared access rules (API + worker), worker never monitors Hunts without access, lapsed periods / Free choice pause extra Hunts, `unpaid` = no access, lifecycle tests | **Done** | 76 |
| B | Mobile billing-free: no prices, plan picker, upgrade or "subscribe on the web"; "Start watching" within current access; neutral limit messages; the optional account line behind a flag | **Done** (device check pending) | 77 |
| C | Mobile navigation Deals / Hunts / Inventory / Account; Home + Analytics web-only | **Done** (device check pending) | 78 |
| D | Product families on plans + family-scoped entitlements + small feature-flag mechanism | **Done** - capabilities + flags (78); families, access states, enforcement, `GET /me/access` (79) | 78, 79 |
| E | Store-compliance review notes, push / deep-link re-check, launch checklist | **Started** - push / deep-link re-check done (step 84, device run pending); store-compliance assessment done (step 86, blockers RB1-RB9 open); mobile account access + policy assumptions A1-A10 for legal / release review ([MOBILE_ACCOUNT_ACCESS.md](MOBILE_ACCOUNT_ACCESS.md)); the review itself, deep-link re-check and launch checklist still to do | 81 |

### Audit findings (step 76)

- **Already matching the strategy:**
  - web-only Stripe billing (checkout and portal, webhook-verified plan changes);
  - subscriptions per user, not device, read by both apps from the API;
  - past due keeps access while Stripe retries; cancel-at-period-end keeps access until the date;
  - downgrades pause Hunts and never delete them;
  - push registration, dead-token cleanup, preferences, and tap opens the deal (no prices or
    emails in push);
  - full deal economics on mobile.
- **Gaps:**
  - mobile showed prices and a "Choose a plan" picker, with "subscribe on the web" / "upgrade"
    copy (phase B);
  - mobile tabs were Home / Hunts / Create / Deals / Analytics (phase C);
  - the worker ignored access, lapsed periods didn't pause Hunts, and `unpaid` kept access
    (phase A - fixed);
  - no product families (D) and no feature flags (D);
  - no trials, grace fields, teams / workspaces or web pricing page (open).

## 4. Change log

| Step | Date | Change |
|---|---|---|
| 86 | 2026-10-15 | **Phase E - store-compliance review:** [APP_STORE_READINESS.md](../release/APP_STORE_READINESS.md) - checklists from primary Apple / Google policy text, 3.1.3(f) analysis, blockers RB1-RB9, draft review notes, submission sequence. Nothing submitted. |
| 85 | 2026-10-15 | **End-to-end review:**<br>- **Journey test:** the whole web-subscription + mobile-companion journey on the real API, worker classes and database (23 checks), with the report in [E2E_REVIEW_2026-10-15.md](../testing/E2E_REVIEW_2026-10-15.md).<br>- **Fixed:** development billing confirmation is now off whenever Stripe is configured (D1, self-granted paid plans), and a flaky test (D2).<br>- **Not yet run:** device, browser and real-provider checks. |
| 84 | 2026-10-15 | **Push and deep links (phase E push re-check):**<br>- **Access:** sourcing pushes are gated by access at send time (suspended / no access / Hunt not live or above the limit = skipped).<br>- **Dead devices:** Expo receipts and stale-device clean-up.<br>- **Taps:** validated deep links that survive an expired session; cold start handled once; token rotation re-registers.<br>- **Testing:** development test push, plus [PUSH_NOTIFICATIONS.md](../PUSH_NOTIFICATIONS.md) with Android / iOS setup and a device checklist. |
| 83 | 2026-10-15 | **Sell workspace + central "+":**<br>- **Owner reversal:** the mobile tab bar has the central orange "+" Create again (Deals · Hunts · + · Inventory · Account); it was moved into the Hunts header in step 78.<br>- **Sell (decision 0019)** on web and mobile: List for sale, AI drafts, photos, cross-listing (eBay simulated, Facebook assisted). Open to every account during beta; not billing.<br>- **Mobile guard** still bans selling Rein Drop and Rein Drop / payment links; it allows the seller's own marketplace pages.<br>- **Next:** the mobile layout should feel native rather than a reduced web app (owner feedback; planned later). |
| 82 | 2026-10-14 | **Streamlined companion:**<br>- **Deal economics:** estimated resale value and the "Estimates, not guaranteed profit" note on deal detail (`DealEconomics`).<br>- **Quick decisions:** Save / Not for me (with Undo) on feed cards.<br>- **Bad connections:** pull-to-refresh, and a failed refresh keeps the content.<br>- **Tests:** jest-expo component and navigation tests (23).<br>- **Matrix:** new "Moved to web only" list in [PLATFORM_FEATURE_MATRIX.md](PLATFORM_FEATURE_MATRIX.md); nothing new moved in this step. |
| 81 | 2026-10-14 | **Mobile account access:**<br>- **Access** from `GET /me/access` (AccessProvider: after sign-in, on foreground, on retry), keyed by account.<br>- **Neutral wording** per state (active, trial, needs attention, grace, no paid access, ended, suspended). Notes on the Hunts / Deals tabs; Create hidden while suspended.<br>- **Session:** offline refresh no longer signs out; a 401 mid-use leads to "Your session has ended"; sign-out removes this phone's push registration first; `prompt=login`; screens remount per account.<br>- **Guard test** extended (purchase SDKs, web views, browser outside sign-in, outbound links, sign-up button).<br>- **Docs:** [MOBILE_ACCOUNT_ACCESS.md](MOBILE_ACCOUNT_ACCESS.md) with the store-policy assumptions A1-A10. |
| 80 | 2026-10-14 | **Web subscription management:**<br>- **`/settings/billing`** on the web (plans, current access, renewal, subscribe via Stripe Checkout, switch / cancel / payment method via the Customer Portal).<br>- **Reconciliation** with Stripe (`POST /billing/sync`; also run on checkout return - the browser's "success" grants nothing).<br>- **Lifecycle tests:** checkout, failed payments, cancellation, renewal, webhook retries, reconciliation.<br>- **Mobile:** unchanged; the guard test now also bans the web billing view.<br>- **Docs:** [BILLING.md](BILLING.md), including the unresolved Stripe configuration P1-P13. |
| 79 | 2026-10-14 | **Subscriptions and entitlements (phase D):**<br>- **Product families:** SOURCE / SELL / COMPLETE on plans; Sell and Complete plans configured but inactive.<br>- **Access states** per product (free, active, trialing, past_due, grace_period, canceled, expired, suspended, none) in `@rein-drop/access`, shared by API and worker. Grace via `BILLING_GRACE_DAYS` (default 0). A scheduled cancellation keeps access until the period ends.<br>- **Account suspension** (`User.accessSuspended*`).<br>- **`GET /me/access`** (no billing secrets).<br>- **Enforcement:** saved-Hunt limit; suspension on create / edit / activate / resume / restore; worker pauses suspended accounts; `@RequiresProduct('sell')` guard.<br>- **Rules + API contract + DB changes:** [ACCESS_RULES.md](ACCESS_RULES.md). |
| 78 | 2026-10-14 | **Phase C + capabilities:**<br>- **One feature list** (contracts/capabilities.ts: platforms, built / flagged / unbuilt, rollout flag, entitlement, development-only) evaluated by the API at GET /me/capabilities with FEATURE_FLAGS.<br>- **Mobile tabs** Deals / Hunts / Inventory / Account from MOBILE_TABS; Create in the Hunts header; Inbox in the Deals header.<br>- **Home and Analytics removed from mobile:** / and /create redirect, unknown routes fall back to Deals; deep links unchanged.<br>- **Moved:** the onboarding prompt to the tab layout.<br>- **Developer card and /dev** only in development builds (audit G7).<br>- **Web** nav items tagged with features (unchanged for users).<br>- **Matrix:** [PLATFORM_FEATURE_MATRIX.md](PLATFORM_FEATURE_MATRIX.md). |
| - | 2026-10-14 | **Audit document** [web-first-mobile-companion-audit.md](../web-first-mobile-companion-audit.md) written on request: current architecture, answers to the 9 audit questions (verified vs recommendation vs assumption), gaps G1-G15, affected files, dependency order, migration notes, phased checklist. Read-only - no code changed. New verified risk: mobile Developer card and `/dev` reachable in release builds (G7). |
| 77 | 2026-10-14 | **Phase B - mobile billing-free:**<br>- **Start watching** (mobile) is now a companion screen: neutral access summary, Start watching within current access, neutral block reasons with actions inside the access (Manage live Hunts, Edit this Hunt). No plan picker, prices or development billing.<br>- **Settings:** "Plan & billing" replaced by "Your access" (plan name, Hunts in use, access-until date, "needs attention" when past due).<br>- **Cancel-plan screen** removed from mobile.<br>- **Shared wording:** the Hunts-list limit suggestion and the Home monitoring state got a companion variant (the web keeps its wording); new companion-access module in client-core.<br>- **Account line:** optional "manage your account at {site}" shown only when the app is built with EXPO_PUBLIC_ACCOUNT_SITE (unset).<br>- **Guard test** in the mobile app: no selling words, billing calls, plan picker or price labels anywhere in the app source. |
| 76 | 2026-10-14 | **Audit + phase A:** decision 0018 written. New `@rein-drop/access` package shared by API and worker. The worker scheduler sweeps access before planning searches. Choosing Free or the dev plan runs the plan-change follow-up. Stripe `unpaid` -> `UNPAID` (migration `20261014181012_subscription_status_unpaid`). Lifecycle integration tests. This tracker created. |

## Appendix - the strategy as given by the owner (2026-10-14, verbatim)

> # REIN DROP - WEB-FIRST BILLING & MOBILE COMPANION STRATEGY
>
> ## 1. Project context
>
> Rein Drop is an AI-powered sourcing and inventory management platform for professional and aspiring resellers.
>
> Its primary value proposition is **"You flip it. We find it."**
>
> The flagship workspace, **Rein Drop Source**, helps users discover potentially profitable inventory by monitoring marketplaces, matching listings against user-defined Hunts, evaluating opportunities and delivering alerts.
>
> The complementary **Rein Drop Sell** workspace supports inventory management, listing creation, crosslisting and related selling workflows.
>
> **Rein Drop Complete** combines both workspaces.
>
> The application and landing page have already been developed to some extent. This task is an architectural and product refinement of the existing project, not permission to rebuild it from scratch.
>
> ## 2. Main architectural decision
>
> Rein Drop is a **web-first SaaS platform with lightweight mobile companion applications**.
>
> The web application is the complete business management environment.
>
> The Android and iOS applications are streamlined operational interfaces for users who want to act on opportunities, manage essential workflows and receive notifications while away from their computers.
>
> All clients use the same accounts, backend, data and subscription entitlements.
>
> The mobile applications must not become independent products or duplicate the complete web experience.
>
> ## 3. Why we are adopting this approach
>
> ### Protect operating margins
>
> Rein Drop incurs recurring operating costs from marketplace data acquisition, monitoring jobs, AI analysis, notifications and infrastructure.
>
> We want to avoid unnecessary app-store payment commissions while complying with applicable platform policies.
>
> ### Serve the actual customer
>
> Our users are intentional resellers who need a business tool, not casual consumers browsing for entertainment.
>
> Our website is expected to be a primary discovery, onboarding and subscription channel.
>
> ### Focus mobile development
>
> The mobile experience should emphasize speed, accessibility and high-value actions.
>
> Complex analytics, billing, bulk operations and administrative workflows can remain on the web application.
>
> ### Maintain one subscription relationship
>
> A user who subscribes through the website must be able to sign into the mobile applications and access the features included in their plan without purchasing a second subscription.
>
> ### Minimize duplication
>
> Business logic, monitoring, AI processing, marketplace integrations and authorization belong in shared backend services.
>
> Mobile applications are clients of those services.
>
> ## 4. Product responsibilities
>
> ### Web application - full platform
>
> The web application should support:
>
> - Landing page, marketing and pricing.
> - Registration, login and onboarding.
> - Seller Snapshot and advanced Hunt configuration.
> - Complete Source workspace.
> - Complete Sell workspace when available.
> - Advanced sourcing and sales analytics.
> - Profitability reporting and historical trends.
> - Inventory management and bulk operations.
> - Marketplace integration configuration.
> - Team and workspace administration where supported.
> - Subscription checkout, upgrades, downgrades, cancellation and billing management.
> - Account and security settings.
>
> ### Mobile applications - focused companion experience
>
> The mobile applications should prioritize:
>
> - Secure sign-in.
> - Account and subscription access checks.
> - Push notifications for relevant deals.
> - Viewing and evaluating sourcing opportunities.
> - Opening the original marketplace listing.
> - Saving, ignoring and organizing deals.
> - Viewing and managing Hunts.
> - Creating simple Hunts where appropriate.
> - Viewing inventory.
> - Capturing product photographs.
> - Creating or editing basic listings when Sell is available.
> - Essential account and notification settings.
>
> Complex dashboards, advanced analytics, bulk inventory management, team administration and billing management should remain web-only.
>
> Do not remove essential deal economics from mobile. A reseller still needs the estimated resale value, fees, shipping assumptions, potential profit, confidence indicators and risk warnings needed to make a decision.
>
> ## 5. Mobile navigation
>
> Target a minimal navigation structure:
>
> 1. **Deals** - alerts, opportunities, saved deals and deal evaluation.
> 2. **Hunts** - active searches, status and basic controls.
> 3. **Inventory** - products, photo capture and basic listing actions, only when supported by the relevant workspace.
> 4. **Account** - profile, notification preferences, access status and sign-out.
>
> The actual navigation should be entitlement-aware and feature-flagged.
>
> For the Source-only MVP, do not expose unfinished Sell features. The Inventory tab can be introduced when the required functionality exists.
>
> ## 6. Billing strategy
>
> **The website is the preferred subscription sales and management channel.**
>
> The mobile applications should initially be designed as free-to-download account-access companions.
>
> By default, mobile applications should not contain:
>
> - Subscription checkout.
> - In-app purchase flows.
> - Pricing comparisons or subscription sales pages.
> - Buttons redirecting users to external checkout.
> - Messages instructing users to visit the website to purchase a subscription.
> - Hidden web checkout screens inside a WebView.
>
> Existing subscribers can sign in and access their entitlements.
>
> Users without an active entitlement should receive a neutral, accurate account-access message, without a purchase call to action.
>
> This is the preferred product design, not a claim of automatic app-store exemption. Review Apple's free companion-app rules, Google Play's payment policies and applicable regional requirements before public release. If review establishes that a different payment flow is required, implement it as a separately approved, region-specific solution rather than silently bypassing store rules.
>
> ## 7. Subscription architecture
>
> The backend must be the authoritative source for account access.
>
> A subscription must not belong to a specific device.
>
> Maintain a provider-independent subscription and entitlement model.
>
> Relevant concepts include: User; Account or workspace; Subscription; Subscription plan; Billing provider; Subscription status; Entitlements; Usage limits; Billing events; Device registrations; Notification preferences.
>
> Supported product families should include Source, Sell and Complete, with configurable plan tiers and usage limits.
>
> Plan configuration must be centralized rather than hardcoded across multiple clients.
>
> Backend authorization must enforce permissions and usage limits. Hiding a feature in the interface is not sufficient.
>
> ## 8. Subscription lifecycle
>
> Handle at least: No subscription; Trial, if supported; Active subscription; Scheduled cancellation while access remains active; Past-due payment; Billing grace period, if supported; Expired subscription; Canceled subscription after the paid period ends; Suspended or revoked access; Reactivation.
>
> Do not automatically equate every canceled or past-due status with immediate loss of access. Entitlements must reflect the provider's effective access period and our documented billing policy.
>
> Preserve user data according to our retention policy. An expired subscription should not automatically delete Hunts, saved deals or inventory.
>
> When an account loses access, restrict paid monitoring and other paid features on the backend, not just in the UI.
>
> ## 9. Shared infrastructure
>
> All platforms should use the existing backend and shared data models.
>
> Sourcing monitors and AI jobs run on backend workers, not on the user's phone.
>
> A Hunt must continue operating according to its subscription entitlements even when the mobile application is closed.
>
> Push notifications should open the relevant deal or application screen through authenticated deep links.
>
> The system should support device registration, notification preferences, invalid token cleanup and secure handling of push payloads.
>
> ## 10. Engineering constraints
>
> Before modifying code, inspect the existing repository and identify what has already been implemented.
>
> Prefer the existing architecture, libraries and conventions. The intended stack includes TypeScript, Next.js, Expo React Native, NestJS, PostgreSQL and Prisma, but verify what actually exists.
>
> Do not duplicate existing functionality, rewrite working modules or introduce a new billing provider without an explicit decision.
>
> Use feature flags and incremental migrations when appropriate.
>
> Preserve existing web functionality and landing-page behavior.
>
> Implement and test changes in small, reviewable phases.
>
> ## 11. Delivery priorities
>
> 1. Audit the existing implementation.
> 2. Define web-versus-mobile responsibilities.
> 3. Establish shared account entitlements.
> 4. Establish or refine web billing integration.
> 5. Implement subscription-aware access behavior.
> 6. Simplify mobile navigation and workflows.
> 7. Integrate notifications and deep links.
> 8. Test subscription lifecycle and cross-platform access.
> 9. Complete app-store compliance review and launch preparation.
>
> ## 12. Definition of success
>
> The intended result is a reseller who: discovers Rein Drop through the website; creates an account and subscribes using web checkout; configures Hunts in the full web application; downloads the free mobile companion app; signs into the same account; receives notifications when relevant opportunities appear; opens a deal and evaluates it on mobile; uses the same Hunts, inventory and account data on both platforms; manages billing through the web application.
>
> The customer has one account and one subscription relationship.
>
> Rein Drop retains a clear separation between the full web platform and the focused mobile companion, while remaining compliant with the applicable app-store requirements.
