# Mobile companion - account access

How the free Rein Drop mobile app signs in to an existing account and shows what that account
can use. The app is a companion (decision 0018): it **never sells**, and billing lives on the web
([BILLING.md](BILLING.md)). Access rules: [ACCESS_RULES.md](ACCESS_RULES.md).

> This document records **assumptions** about app-store policy. Building the app this way does
> **not** by itself guarantee compliance with Apple App Store or Google Play rules. Section 6 lists
> what needs legal / release review before submission.

## 1. Flow

1. **Install:** free. No in-app purchase, no purchase SDK.
2. **Sign in:** Entra External ID (decision 0013) in the system browser. Authorization code +
   PKCE, public client, `prompt=login`, so the person always picks who signs in. The app signs in
   to an **existing** account; there is no "create an account" button on mobile.
3. **Who am I:** `GET /me`.
4. **Access:** `GET /me/access`, the same resolver the API and worker enforce. It is fetched
   after sign-in, whenever the app returns to the foreground, and on "Try again".
5. **Render:** the tabs Deals / Hunts / Inventory / Account follow the capabilities
   (`GET /me/capabilities`). The access state shapes the Account card and the notes on the tabs.

## 2. Access states (what the person sees)

All wording comes from `packages/client-core/src/companion-account.ts`.

| Server state | Badge | Message | Paid features | Hunts |
|---|---|---|---|---|
| `active` | Active | "Your Pro access is active." | yes | yes |
| `active` + cancellation scheduled | Active | "Your current access continues until {date}." | yes | yes |
| `trialing` (not offered today, ready if enabled) | Trial | "Your trial access continues until {date}." | yes | yes |
| `past_due` | Needs attention | "Your account needs attention. Your current access continues for now." | yes | yes |
| `grace_period` | Needs attention | "Your current access continues until {date}." | yes | yes |
| `free` / no subscription | Free | "This account doesn't currently have access to paid features." | no | within Free |
| `expired` / `canceled` | Free | Same neutral line, plus "Your Hunts, inventory and saved deals are kept. Hunts beyond what's included now are paused, not deleted." | no | within Free |
| `suspended` | Suspended | "This account's access is suspended by Rein Drop, so Hunts aren't being watched." plus the data-kept line | no | Create / Start watching hidden; the API refuses them too |

Where each state appears:
- **Account tab, "Your access":** the badge, the message, and the live / saved Hunt counts.
- **Hunts tab:** a note for suspended, needs-attention, grace and ended states.
- **Deals tab:** a note only while suspended.

**Nothing is deleted** when paid access ends. The server pauses Hunts above the new limit and
keeps everything (tests: `apps/api/test/billing-lifecycle.int-spec.ts`,
`apps/worker/test/access.int-spec.ts`).

## 3. Session handling

| Situation | Behaviour |
|---|---|
| Token storage | Access and refresh tokens are in the device keychain / keystore (`expo-secure-store`), never in plain storage |
| Token refresh | 5 minutes before the access token expires; one refresh at a time; the session's absolute end (`EXPO_PUBLIC_AUTH_SESSION_MAX_AGE_HOURS`, default 7 days) is never extended |
| Refresh refused by Entra (revoked / expired) | Session forgotten, then the sign-in screen: "Your session has ended" |
| Offline during refresh | **Not signed out.** The still-valid token is kept; if it has run out, "Can't reach Rein Drop … Nothing on your account has changed" with Try again (`afterRefreshFailure`) |
| API answers 401 mid-use | Back to sign-in with "Your session has ended. Sign in again to continue - your Hunts, inventory and deals are kept." |
| Network error loading access | The last known access stays visible with "Showing your last known access"; without one, "You're offline" plus Try again |
| Sign-out | (1) This phone's push registration for the account is removed, while the session still works. (2) Tokens are deleted from secure storage. (3) The Entra browser session is ended |
| Account switching | Sign out, then sign in as the other person. Every screen remounts per account (`SessionGate` keyed by user). Access and capabilities are tagged by account, so the previous account's data never shows. A late response for the previous account is ignored (`accessLoadReducer`). Push re-registers for the new account (the server moves the phone's token) |

## 4. Never on mobile (guarded by tests)

`apps/mobile/src/companion-copy.spec.mjs` scans every screen and the app's dependencies for:
- **Selling words:** pricing, upgrade, subscribe, unlock, free trial, restore purchases,
  checkout, change / cancel plan, manage billing, "on the web".
- **Billing calls:** checkout, portal, plan list, billing info, sync.
- **Purchase SDKs or web views:** the package.json dependencies, `react-native-webview` and
  `<WebView>`.
- **The system browser** (`expo-web-browser`) anywhere other than sign-in.
- **Outbound links** other than marketplace listing URLs, and any link to a Rein Drop site.
- **A sign-up / create-account button.**
- **The optional account line** (`EXPO_PUBLIC_ACCOUNT_SITE`, off) if it ever becomes a link.

`packages/client-core/src/companion-account.spec.ts` covers:
- every access state;
- a trial → active → past due → grace → expired journey;
- the absence of selling words in all of this wording;
- sign-in / sign-out / account-switch / offline loading transitions.

## 5. Not built / limitations

- **Session expiry and push:** when a session expires (rather than an explicit sign-out), the
  phone's push registration can't be removed, because there is no valid token. Alerts for that
  account keep arriving until someone signs in again (which moves the registration) or a sign-out
  happens. The registration id is kept only from this version on; older installs aren't
  unregistered at sign-out.
- **Account deletion** isn't built (web or mobile). See A3.
- **Remembering several accounts** (switching without signing out) is not supported, by design.

## 6. App-store policy assumptions - need legal / release review

These are working assumptions, **not** compliance claims. Each needs review against the current
guideline text before the first store submission (phase E).

| # | Assumption | Guideline area to check | Risk if wrong |
|---|---|---|---|
| A1 | The app qualifies as a **free stand-alone companion to a paid web tool**, so it doesn't need in-app purchase, provided there is no purchasing inside the app and no call to action to purchase outside it | Apple App Review Guidelines 3.1.3(f) "Free Stand-alone Apps"; **not** the Reader-app category 3.1.3(a), which covers media apps | Apple may treat the app as unlocking paid features (3.1.1 / 3.1.3(b) multiplatform services: content bought elsewhere may need to be offered as IAP too) |
| A2 | Google Play allows a free companion app that only **uses** access bought on the web, with no purchase flow or steering in the app | Google Play Payments policy (consumption-only apps, steering rules) | Play may require Play Billing or forbid steering-like wording |
| A3 | The app doesn't **create** accounts, so Apple's in-app account-deletion requirement doesn't apply. But the Entra hosted page may still show a sign-up link | Apple 5.1.1(v) account deletion | Release review must either turn off self-service sign-up for the mobile app's Entra user flow, or build account deletion |
| A4 | "This account doesn't currently have access to paid features" and "Your account needs attention" are information, not a call to action to purchase | Apple 3.1.3(f) "calls to action"; Play steering | Wording may need to change (it is centralized in client-core) |
| A5 | The optional "You can manage your account at {site}" line stays **off** (`EXPO_PUBLIC_ACCOUNT_SITE` unset) until reviewed | Apple 3.1.3(f), 3.1.1; Play steering; regional link rules (US / EU / KR / JP entitlements) | Turning it on without review may be read as steering |
| A6 | Email + password through Entra counts as Rein Drop's own account system, so Sign in with Apple isn't required | Apple 4.8 Login Services | If Google / Facebook / other social sign-in is enabled in Entra, 4.8 likely applies |
| A7 | Privacy disclosures cover email, push tokens, device name and usage | Apple privacy labels / 5.1.1; Play Data safety | Rejection or listing removal |
| A8 | Push is used for alerts the person enabled, not marketing (marketing is opt-in in settings) | Apple 4.5.4 | Rejection |
| A9 | No reliance on regional exceptions (EU DMA alternative payments, US link-out rulings, Korea / Japan) | Regional storefront rules | None while nothing links out. Revisit if a link is ever wanted |
| A10 | Trials, if ever enabled, are started on the web only. The app only displays the state | Apple 3.1.2 / 3.1.3; Play | Same as A1 |

> **Step 86:** the assumptions above were checked against the primary policy text (fetched 2026-10-15) in [release/APP_STORE_READINESS.md](../release/APP_STORE_READINESS.md), which supersedes this table for release decisions (checklists, blockers RB1-RB9, draft review notes).
