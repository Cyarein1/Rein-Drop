# Release readiness and app-store compliance assessment - Rein Drop mobile companion

_Prepared 2026-10-15 (step 86). Nothing has been submitted or published._

> **This is not legal advice and not a prediction of approval.** App Review (Apple) and policy
> enforcement (Google) are discretionary, and both stores change their rules. This assessment
> compares the app **as it is built today** (this repository) with the policy text read on
> 2026-10-15. Everything marked *Interpretation* or *Recommendation* needs legal / release review
> before the first submission.

**Sources (primary, fetched 2026-10-15):**

| ID | Source |
|---|---|
| [AG] | Apple App Review Guidelines, "Last Updated: June 8, 2026" - https://developer.apple.com/app-store/review/guidelines/ |
| [AD] | Apple, Offering account deletion in your app - https://developer.apple.com/support/offering-account-deletion-in-your-app/ |
| [AP] | Apple, App Privacy details - https://developer.apple.com/app-store/app-privacy-details/; privacy manifest docs |
| [AR] | Apple, Reader apps / External Link Account Entitlement - https://developer.apple.com/support/reader-apps/ |
| [GP] | Google Play Payments policy - https://support.google.com/googleplay/android-developer/answer/9858738 |
| [GF] | Google Play Payments FAQ (consumption-only) - https://support.google.com/googleplay/android-developer/answer/10281818 |
| [GU] | Google Play US programs update (Epic settlement) - https://support.google.com/googleplay/android-developer/answer/15582165 |
| [GD] | Google Play account deletion requirements - https://support.google.com/googleplay/android-developer/answer/13327111 |
| [GUD] | Google Play User Data policy - https://support.google.com/googleplay/android-developer/answer/10144311 |
| [GPV] | Google Play Photo and Video Permissions - https://support.google.com/googleplay/android-developer/answer/14115180 |
| [GA] | Google Play App access for review - https://support.google.com/googleplay/android-developer/answer/15748846 |
| [GT] | Google Play target API level - https://support.google.com/googleplay/android-developer/answer/11926878 |
| [AN] | Android notification runtime permission (last updated 2026-10-01) - https://developer.android.com/develop/ui/views/notifications/notification-permission |

Google Help pages show no "last updated" date. The regional program pages (EEA / India / Korea)
were not opened, only summarised from [GF].

---

## 1. What the app actually does (verified in code)

| Area | Implemented behaviour | Evidence |
|---|---|---|
| Purchasing | **None.** No in-app purchase SDK, no WebView, no checkout, no billing calls. A guard test fails the build if any appear | `apps/mobile/package.json`; `apps/mobile/src/companion-copy.spec.mjs` |
| Prices, plans, upgrade wording | **None on mobile.** No prices, plan picker, "upgrade", "subscribe" or "on the web". Shared wording uses `'companion'` variants (checked: `planLimitState(…, 'companion')`; mobile never calls the plan / price / billing view functions) | guard test; `packages/client-core/src/companion-*.ts`; `apps/mobile/src/app/(tabs)/hunts.tsx` |
| Access / expiry wording | Neutral. "This account doesn't currently have access to paid features." Ended plans say Hunts / inventory / deals are kept; "Your account needs attention" while a payment is retrying; no link or call to action | `packages/client-core/src/companion-account.ts` (+ spec checking no selling words) |
| Optional account-site line | "You can manage your account at {site}." is **off** (built only if `EXPO_PUBLIC_ACCOUNT_SITE` is set) | `accountSiteLine`; guard test (never a link) |
| Sign-in | Microsoft Entra External ID, authorization code + PKCE in the **system browser**; tokens in Keychain / Keystore; `prompt=login`. **Email + password only** today (no social providers configured in code) | `apps/mobile/src/auth/entra-provider.ts` |
| Account creation | No "Create an account" button in the app (removed step 81). **But** the Entra hosted page reached from "Sign in" may show a sign-up link - a tenant setting, not visible in code | step 81; MOBILE_ACCOUNT_ACCESS.md A3 |
| Account deletion | **Not built anywhere**: no API endpoint, no web page, no in-app path | `apps/api/src` (only `DELETE /me/area` exists) |
| Privacy policy | Web `/privacy` exists but is an **unreviewed draft about the early-access waitlist / website only**; it doesn't cover app data. **No privacy link in the app** | `apps/web/src/marketing/legal/legal-drafts.ts` (`reviewed: false`); no "privacy" string in `apps/mobile/src` |
| Data the app / backend handle | Email, display name, Entra ids; Hunts (incl. an approximate area and coordinates); deals; inventory and sale prices; listing photos (own uploads); push token, device name, app version; notification preferences; product events (log provider); AI processing of listing text (Azure OpenAI / Foundry when configured) | Prisma schema; `notifications`, `sell`, `telemetry` modules |
| Notifications | Never prompted on launch. Asked only from the "Hunt is live" card or Settings; works without (inbox). Android channel "Deal alerts". Marketing push is opt-in | `apps/mobile/src/notifications/push.ts`; [AN] |
| Camera / photos | `expo-image-picker`: camera (purpose string set), system photo picker; **no READ_MEDIA_IMAGES**; READ / WRITE_EXTERNAL_STORAGE limited to `maxSdkVersion=32`; microphone blocked | `apps/mobile/app.json`; library manifest |
| Location | No device-location permission. Areas are typed text; maps show the typed area | `apps/mobile/src/geo/*` |
| External links | Open in the system browser: marketplace listings (eBay / Facebook), the seller's own posted listing, Facebook's "create listing" page (assisted cross-listing). Never a Rein Drop site or payment page (guard test) | `deals/[id].tsx`, `inventory/[id]`, `sell/[id].tsx` |
| Sell (physical goods) | Seller lists **their own physical items**. eBay publishing is a **mock** that shows "Listed (simulated)"; Facebook is copy-and-open | decision 0019 |
| Marketplace sources in production | **eBay only when eBay API keys are set. There is NO Facebook source in production** (the Apify scraping provider is development-only). The app still offers "Facebook Marketplace" when creating a Hunt | `packages/marketplace-core/src/adapters/registry-factory.ts` |
| Placeholder / beta content | Account tab shows a "**Placeholder screen** - Most settings sections are listed but not editable yet" banner (outdated). Onboarding has a "Coming soon" screen for non-resellers. Plan limits are placeholders in the database | `AccountScreen.tsx:57`; `onboarding.tsx` |
| Developer tools | Development builds only (`__DEV__`) | capabilities `dev.tools` |
| Builds | No EAS project id, bundle id / package or `eas.json` yet. Android target SDK 36 (Expo SDK 57 / RN 0.86 default) | `apps/mobile/app.config.ts`; RN `libs.versions.toml` |

---

## 2. Apple App Store checklist

Status: ✅ meets the text as built · ⚠️ needs review / decision · ❌ blocker as built.

| # | Requirement (confirmed text) | Source | Status | Notes / action |
|---|---|---|---|---|
| A1 | IAP required to "unlock features or functionality" (3.1.1) | [AG] 3.1.1 | ⚠️ | Paid web tiers unlock more live Hunts / marketplaces, which the app then shows. Rein Drop relies on the **3.1.3(f) exception** (section 4). Not IAP-compliant on its own |
| A2 | 3.1.3(f): free companion to a paid web tool needs no IAP "provided there is no purchasing inside the app, or calls to action for purchase outside of the app" | [AG] 3.1.3(f) | ✅ as built / ⚠️ applicability | No purchasing and no CTAs (guard test). Applicability is App Review's judgement (section 4) |
| A3 | Outside the US: no buttons / links / CTAs to other purchasing (3.1.1(a), 3.1.3 intro). US storefront: the prohibition doesn't apply | [AG] | ✅ | No CTAs in any storefront. **Recommendation:** don't use the US allowance - it would undermine 3.1.3(f) ("no calls to action") |
| A4 | 3.1.3(b) multiplatform: content bought elsewhere only if **also** offered as IAP | [AG] | n/a | Not relied on - Rein Drop offers no IAP |
| A5 | 3.1.3(a) reader apps / External Link Account Entitlement: media only | [AG], [AR] | n/a | Doesn't apply (not magazines / books / audio / music / video) |
| A6 | 3.1.3(e): physical goods / services consumed outside the app must not use IAP | [AG] | ✅ | Sell lists physical goods on marketplaces; nothing is bought in the app |
| A7 | 4.8: social login requires an equivalent option (e.g. Sign in with Apple); exception: "exclusively uses your company's own account setup and sign-in systems" | [AG] 4.8 | ✅ / ⚠️ | Email + password via Rein Drop's own Entra tenant. **If Google / Facebook / Microsoft-account sign-in is enabled in Entra, Sign in with Apple becomes required** |
| A8 | 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app"; deactivation is insufficient; a web step may finish it with a direct link | [AG], [AD] | ❌ | Deletion isn't built. Whether the app "supports account creation" depends on the Entra hosted page offering sign-up (not stated by Apple for hosted pages - *interpretation*). **Recommendation:** build in-app deletion regardless |
| A9 | 5.1.1(v): may require login when directly relevant to core functionality | [AG] | ✅ | Hunts, deals, inventory and alerts are account data |
| A10 | 5.1.1(i): privacy policy link in App Store Connect **and inside the app**; covers retention / deletion and how to request deletion | [AG] | ❌ | No app privacy policy (the draft covers the waitlist only, unreviewed); no in-app link |
| A11 | App Privacy details ("nutrition labels"), incl. third-party SDKs | [AP] | ❌ | Not prepared. Inventory in section 1 + Expo SDKs (expo-notifications, image picker, secure store, maps) |
| A12 | Privacy manifest / required-reason APIs | [AP] | ⚠️ | Expo generates PrivacyInfo.xcprivacy for its modules - **verify in the first EAS iOS build** |
| A13 | 5.1.2(i): disclose sharing of personal data with third parties, **including third-party AI** | [AG] | ❌ (when AI is on) | "Use AI" sends item text (and notes) to Azure OpenAI / Foundry. Needs an in-app disclosure near "Use AI" + policy text. (With `AI_PROVIDER` unset, AI is off) |
| A14 | 5.1.1(iii): prefer out-of-process pickers | [AG] | ✅ | System photo picker; camera only on tap |
| A15 | 5.1.1(ii): purpose strings describe the use | [AG] | ✅ | Camera / photos strings set in `app.json` |
| A16 | 4.5.4 / 5.1.2(i): push not required to function; no marketing without opt-in; no sensitive data | [AG] | ✅ / ⚠️ | Not required; marketing is opt-in. **Decide** whether listing titles / Hunt names on the lock screen are acceptable (U5) |
| A17 | 2.1: demo account with full access + backend on | [AG] 2.1(a) | ❌ | Needs a review account **with paid access** and seeded deals / Hunts / inventory, no MFA prompts. There's no admin tool to grant paid access in Stripe mode (development confirm is off by design since step 85) |
| A18 | 2.1 / 2.2 completeness: no placeholder / beta content in store builds | [AG] | ❌ | "Placeholder screen" banner on Account; "Coming soon" non-reseller screen; **"Listed (simulated)" eBay publishing**; Facebook offered in Hunts but **no production source** |
| A19 | 2.3.3 / 2.3.7: screenshots show the app in use; no prices in metadata | [AG] | ⚠️ | Not prepared. Don't show plan names, prices, "upgrade" or "Pro" in screenshots, text or keywords |
| A20 | 4.2 minimum functionality (more than a repackaged website) | [AG] | ✅ | Native screens, push, camera, offline handling |
| A21 | 5.2.x third-party content / IP (*interpretation*): content and services from third parties must be permitted by their terms | [AG] 5.2 (not quoted in research) | ⚠️ | (a) eBay Browse API data - follow eBay API license display terms. (b) **Reusing other sellers' listing photos** in your own listing - IP / marketplace-rule risk; the app warns but allows it. Legal review |

---

## 3. Google Play checklist

| # | Requirement (confirmed text) | Source | Status | Notes / action |
|---|---|---|---|---|
| G1 | Play Billing required for in-app features / digital services "unless Section 3, 8, or 9 applies"; examples include business productivity / cloud software | [GP] | ✅ (consumption-only) | The app sells nothing |
| G2 | "Google Play allows any app to be consumption-only, even if it is part of a paid service… access content paid for somewhere else"; "cannot be purchased from within the app" | [GF] | ✅ | Matches the implementation |
| G3 | No steering: no webviews / buttons / links / messaging, and no **"account creation or sign-up flows"** leading to non-Play payment | [GP] | ✅ / ⚠️ | No links or messaging. **The Entra sign-up flow (if enabled) must never lead to Stripe checkout or plan selection** - keep the hosted page free of pricing / plan steps |
| G4 | US programs (Dec 9, 2025 / Mar 4, 2026 settlement): linking out requires program enrolment and fees from Oct 1, 2026 | [GU] | n/a | Not used |
| G5 | Physical goods must not use Play Billing (incl. online auctions) | [GP] | ✅ | Sell = physical goods on marketplaces |
| G6 | Account deletion: if the app lets users create an account **or "directs the user to an app account creation flow outside of the app"**, provide an in-app deletion path **and** a web deletion resource; Data safety deletion questions | [GD] | ❌ | Not built. Applies if the Entra page offers sign-up (that page is reached from the app). **Recommendation:** build both |
| G7 | Privacy policy link in Play Console **and** in the app, public, non-geofenced, not a PDF | [GUD] | ❌ | As A10 |
| G8 | Accurate Data safety section incl. SDKs | [GUD] | ❌ | Not prepared |
| G9 | Photo / video: READ_MEDIA_IMAGES / VIDEO only if the system picker is insufficient | [GPV] | ✅ | Not declared (verified library manifest; the photo picker is used). **Verify the merged manifest of the release build** |
| G10 | POST_NOTIFICATIONS runtime permission on Android 13+ | [AN] | ✅ | Requested only on an explicit action; declared by expo-notifications |
| G11 | App access: reusable reviewer credentials, valid everywhere, bypassing 2-step / OTP | [GA] | ❌ | As A17 (Entra MFA / email OTP exemption for the review account) |
| G12 | Target API level 36 for new apps / updates (since Aug 31, 2026) | [GT] | ✅ | Expo SDK 57 / RN 0.86 targets 36 - verify in the built AAB |
| G13 | Prominent disclosure when data use is outside reasonable expectation | [GUD] | ✅ / ⚠️ | Camera and photos are user-initiated. AI listing drafts: add an in-app disclosure (as A13) |
| G14 | No apps whose primary purpose is affiliate traffic or a webview of a site | [GP] spam | ✅ | Links are incidental |
| G15 | Completeness / misleading functionality (*interpretation* - general Play policy, not quoted) | - | ❌ | Same as A18: Facebook offered without a production source; simulated eBay publishing; placeholder banner |

---

## 4. Apple Guideline 3.1.3(f) - applicability and limitations

**Confirmed text:** "Free apps acting as a stand-alone companion to a paid web based tool (i.e. VoIP,
Cloud Storage, Email Services, Web Hosting) do not need to use in-app purchase, provided there is no
purchasing inside the app, or calls to action for purchase outside of the app." [AG]

**Interpretation - why it plausibly fits Rein Drop:**
- The paid product is a web-based SaaS tool (sourcing monitoring, deal analysis, inventory, analytics,
  billing). Subscriptions are sold and managed only on the web (decision 0018).
- The app is free, and as built contains **no purchasing and no calls to action**, including in
  expiry and limit wording, enforced by an automated guard test.
- Server-side monitoring runs whether or not the app is installed; the app is a viewer and controller
  of that web service, like the listed examples (email, cloud storage, hosting dashboards).

**Limitations and risks (interpretation):**
1. **Examples, not a definition.** The listed examples are infrastructure-like tools. App Review may
   regard deal alerts and Hunts as "features or functionality" unlocked by a subscription (3.1.1) and
   ask for IAP under 3.1.3(b) (multiplatform: "also available as in-app purchases").
2. **"Stand-alone companion"** - the app must be useful with the web tool, without becoming the main
   way the paid product is consumed. Rein Drop's push alerts arguably make mobile a primary channel.
   Be ready to explain that monitoring, analytics, billing and full management are on the web.
3. **Any CTA breaks it** - including "visit our website", the optional account-site line (keep OFF),
   upgrade hints in shared copy, store metadata, screenshots and review notes that talk about prices.
4. **Free accounts work in the app.** The 3.1.3(f) logic is about paid tiers. Free users can use the
   app within Free limits, which is consistent with a free companion.
5. **The US storefront allowance (3.1.1(a))** permits links in the US, but using it introduces CTAs
   that 3.1.3(f) excludes. **Recommendation:** don't use it unless counsel advises otherwise.
6. **Fallback if rejected under 3.1.1:**
   - (a) appeal with the 3.1.3(f) rationale;
   - (b) offer the same tiers as IAP (3.1.3(b)) - a product / pricing decision with Apple's commission;
   - (c) restrict the iOS app to Free features.

   Never hide purchase functionality from reviewers - none exists, and none should be added only for
   review builds.

## 5. Google Play - sign-in and account access vs digital-services payment rules

- **Confirmed:** consumption-only apps are allowed even when part of a paid service; "a user could log
  in when the app opens and access content paid for somewhere else" [GF].
- **As built:** sign-in only (system browser, Entra). No purchasing, no links or messages about
  payment. Expiry wording is neutral.
- **Interpretation:** compliant with Payments policy, provided the **sign-up flow reachable from the
  app** (Entra hosted page) never leads to Stripe or plan selection [GP "account creation or sign-up
  flows"].
- **Note:** plain-text "go to our website to upgrade" is tolerated by [GF], but Rein Drop
  deliberately doesn't use it - one global, CTA-free app (Apple 3.1.3(f)).
- **Account deletion [GD]** is the main Google gap: "directs the user to an app account creation flow
  outside of the app" likely includes the Entra hosted sign-up. Requires an in-app path plus a web
  resource, and the Data safety answers.

---

## 6. Release blockers

| # | Blocker | Store | Type | Fix |
|---|---|---|---|---|
| RB1 | **No account deletion** (in-app path + web resource; must handle data and the Stripe subscription) | Apple A8, Google G6 | Confirmed requirement (if account creation is reachable) | Build: `DELETE /me` flow (confirm, cancel the Stripe subscription, delete or anonymise data, remove push devices); Account tab "Delete account"; public web page `/account/delete`. Or remove self-service sign-up from the mobile user flow **and** still build deletion (recommended) |
| RB2 | **No app privacy policy; no in-app link** | Apple A10, Google G7 | Confirmed | Legal: an app privacy policy covering section 1's data, processors (Microsoft Entra / Azure, Stripe on web, Expo push, Azure OpenAI / Foundry, eBay API), retention, deletion and rights (POPIA / GDPR as applicable). Link it in the Account tab and both stores |
| RB3 | **Store privacy forms** not prepared (App Privacy details, Data safety incl. deletion questions) | A11, G8 | Confirmed | Fill from section 1. Verify SDK data (Expo) |
| RB4 | **Reviewer access**: account with paid access + seeded data, no MFA / OTP, reusable | A17, G11 | Confirmed | Create a review tenant user. Grant access via a Stripe test-mode 100%-off subscription or an operator script (no in-app path). Seed Hunts / deals / inventory. Exempt from MFA |
| RB5 | **Placeholder / non-working features in store builds**: "Placeholder screen" banner; "Coming soon" screen; eBay "Listed (simulated)"; Facebook offered with no production source | A18, G15 | Interpretation of completeness rules (likely rejection) | Remove the stale Account banner. Hide Facebook in Hunts and Sell when no source / publisher is live (driven by server capabilities). Hide eBay publish until real (or ship Sell as Facebook-assisted only). Replace "Coming soon" with a complete neutral screen |
| RB6 | **Third-party AI disclosure** for "Use AI" (when AI is configured) | A13, G13 | Confirmed (Apple) | Short in-app notice + consent text near "Use AI"; mention in the privacy policy |
| RB7 | **Build identity and credentials**: EAS project, bundle id / package, `eas.json`, APNs key, FCM v1 credentials | both | Confirmed (to build at all) | `docs/PUSH_NOTIFICATIONS.md` section 4 |
| RB8 | **Legal review of 3.1.3(f) reliance and wording** (A1-A10 in MOBILE_ACCOUNT_ACCESS.md) | Apple | Interpretation | Counsel sign-off before first submission |
| RB9 | **Entra tenant decisions**: self-service sign-up on/off; social providers (triggers Sign in with Apple); no plans / pricing in hosted pages | A7, A8, G3, G6 | Confirmed consequences | Decide and configure; record in MOBILE_ACCOUNT_ACCESS.md |

**Needs review, not a blocker by itself:**
- **IP:** reusing source-listing photos.
- **Marketplace terms:** the eBay API license.
- **Lock-screen content.**
- **Regional distribution** - target countries (owner, 2026-10-15): see section 6a.

## 6a. Target countries: United States, United Kingdom, Canada, Australia, Germany

| Country | Storefront payment rule as it affects Rein Drop (confirmed text in sections 2-3) | Product / legal points to check (interpretation / recommendation) |
|---|---|---|
| **United States** | Apple: the CTA prohibition doesn't apply on the US storefront (3.1.1(a)). Google: link-out only via the US programs with fees from Oct 1, 2026 [GU]. **Rein Drop uses neither - the app stays CTA-free (3.1.3(f))** | eBay US (EBAY_US, USD), miles. Sales tax on web subscriptions (Stripe Tax, P8). State privacy laws (e.g. CCPA / CPRA) in the privacy policy |
| **United Kingdom** | Apple: no CTAs ("all other storefronts"). Google: Play Billing / steering rules | eBay UK (EBAY_GB, GBP), miles. UK GDPR + PECR (marketing / cookies). VAT on subscriptions |
| **Canada** | As UK | eBay Canada (EBAY_CA, CAD), km. PIPEDA (+ Quebec Law 25). **Quebec French-language rules (Charter / Bill 96) may require French for consumers in Quebec - legal review** (the app is English-only). GST / HST |
| **Australia** | As UK | eBay Australia (EBAY_AU, AUD), km. Privacy Act 1988 / APPs. Australian Consumer Law (subscription terms). GST |
| **Germany (EU)** | Apple: no CTAs; EU alternative terms (DMA) **not used**. Google: EEA programs **not used** | eBay Germany (EBAY_DE, EUR), km. GDPR + TTDSG. **Impressum** (legal notice) on the website / app listing. **EU Digital Services Act trader status** must be declared in App Store Connect and Play Console before EU distribution (*verify current requirements - not fetched in this review*). VAT. **German UI / store listing** (the app is English-only; decide whether German launches in English) |

**Code facts for these countries (verified):**
- **Supported today:**
  - Currency, distance unit and language defaults follow the user's locale: USD / GBP / CAD / AUD /
    EUR; miles for US / GB.
  - The mock place search includes towns in all five countries.
  - The eBay client supports EBAY_US / GB / CA / AU / DE (currency map).
- **Gap (build needed):** eBay search uses **one site per deployment** (EBAY_MARKETPLACE_ID,
  default EBAY_US). For five countries, each Hunt must search its owner's eBay site.
- **Gap:** Facebook Marketplace has no production source in any country.
- **Not supported:** UI translations - only English exists.
## 7. Draft app-review explanation (for App Review notes and the Play "App access" field)

> **About Rein Drop**
> Rein Drop is a web-based software platform for resellers. On the web (https://<your domain>),
> resellers create saved searches ("Hunts"). Rein Drop's servers then monitor online marketplaces
> around the clock, analyse new listings and flag likely deals. The web platform also handles
> analytics, inventory and sales records, and account and subscription management. Paid
> subscriptions for the web platform are sold and managed only on our website, through our web
> payment provider.
>
> **About this app**
> This free app is a companion to the Rein Drop web platform (App Review Guideline 3.1.3(f)). It
> lets people with an existing Rein Drop account sign in and, on the go:
> - see the deals Rein Drop has found and receive optional alerts;
> - pause, resume or edit their Hunts;
> - track the items they bought;
> - prepare listings to sell their own physical items on marketplaces.
>
> The app contains no purchasing of any kind: no in-app purchases, prices, plan comparisons,
> subscription offers, or links, buttons or messages directing users to buy anything outside the
> app. If an account doesn't have access to a paid feature, the app says so neutrally ("This account
> doesn't currently have access to paid features") without directing the user anywhere. The app uses
> the account's existing access exactly as it is; it never changes it. Physical items listed for
> sale are sold on third-party marketplaces, not in the app.
>
> **Sign-in**
> Sign-in uses our own account system (email and password, through Microsoft Entra External ID in
> the system browser). [If sign-up is enabled: New accounts are free; account deletion is in Account
> > Delete account.] [If sign-up is disabled: Accounts are created on our website.]
>
> **Review account**
> - Email: <review account>  Password: <password> (no two-step verification).
> - This account has an active paid plan and sample Hunts, deals and inventory, so every screen has
>   content.
> - To see an alert: open Hunts, open "<Hunt name>"; deals appear under Deals. Notifications are
>   optional: allow them from the "Hunt is live" card or Account > Notifications on this phone.
>
> **Permissions**
> - **Camera / Photos:** used only when you add photos to a listing of your own item (system photo
>   picker).
> - **Notifications:** optional deal alerts.
> - The app doesn't use device location.
>
> **Contact:** <name, email, phone> for any questions during review.

_Keep the review notes free of prices and plan names. Fill in the bracketed parts from the RB9
decision. Don't use this text until the blockers above are closed and counsel has reviewed it._

## 8. Recommended submission and testing sequence

1. **Decide:**
   - the Entra sign-up and social-login settings (RB9);
   - the countries for launch;
   - whether Sell ships in v1 (Facebook-assisted only) or is hidden until eBay publishing is real.
2. **Fix the build blockers:**
   - RB1 account deletion (API, app, web page);
   - RB5 completeness (remove the placeholder banner; capability-driven hiding of Facebook / simulated eBay);
   - RB6 AI disclosure;
   - privacy-policy link in the app.
   - Re-run the full test suite and the step-85 journey.
3. **Legal:** app privacy policy + terms (RB2); 3.1.3(f) reliance and wording sign-off (RB8); IP /
   marketplace terms check.
4. **Accounts and credentials:**
   - Apple Developer Program, Google Play Console, an EAS project;
   - bundle id / package, APNs key, FCM v1 (RB7);
   - production API / worker with `PUSH_PROVIDER=expo`;
   - the review account with paid access + seed data (RB4).
5. **Internal device testing:**
   - EAS development build → the push checklist (PUSH_NOTIFICATIONS.md section 5) and the
     account-access checks (MOBILE_ACCOUNT_ACCESS.md) on one Android and one iPhone;
   - verify the merged Android manifest (no READ_MEDIA_*, target 36) and iOS PrivacyInfo.xcprivacy.
6. **Store records:** App Privacy details and Data safety (incl. deletion URL); screenshots of real
   app use without prices; descriptions without plan / price language; age rating; content rights
   (third-party marketplace content).
7. **Closed testing:**
   - TestFlight internal → external (Beta App Review; a useful early signal on 3.1.3(f)).
   - Google Play internal → closed testing track. New personal developer accounts may have a
     minimum closed-testing period before production; verify the current Play Console requirement.
8. **Submit for review** with the section 7 notes and the review account. Respond to questions
   factually. If App Review cites 3.1.1, use the fallback options in section 4 (point 6). Never hide
   functionality.
9. **Staged release:** phased release (Apple) / staged rollout (Play). Monitor crash reports, push
   receipts and account-deletion requests. Re-check the guidelines before every update - both stores
   changed payment rules in 2025-2026.

## 9. Items requiring further review (summary)

- **3.1.3(f) applicability:** App Review discretion, examples-based (section 4).
- **What counts as "supports account creation":** does a hosted sign-up page reached from the app
  count? Not addressed by Apple's text; Google's FAQ suggests yes.
- **Lock-screen content of alerts** (titles / Hunt names).
- **Marketplace logos inside the apps** (eBay wordmark, Facebook icon - step 87): check eBay's and Meta's brand / trademark terms for use in a commercial app (Apple 5.2.1 / Play IP policy). The landing page uses the same files (decision L-D6).
- **Country-specific obligations** in section 6a (Quebec French, Impressum, EU trader status, tax).
- **Reuse of other sellers' photos** in listings (IP / marketplace rules).
- **eBay API license display / attribution terms.**
- **Regional programs** (EEA DMA, India, Korea): not needed while CTA-free; not reviewed in detail.
- **Privacy law obligations** (POPIA / GDPR) for the privacy policy, retention and deletion: counsel.
