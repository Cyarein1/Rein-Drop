# Push notifications - how they work, setup, and device testing

Alerts for newly qualified deals reach the phone as push notifications from the mobile
companion. Decisions: [0006](decisions/0006-alerts-and-notifications.md) (alerts and the outbox) and
[0018](decisions/0018-web-first-billing-mobile-companion.md) (companion, access). This page covers the
pipeline, the rules, the setup the owner still has to do for Android and iOS, and a manual
device-testing checklist.

## 1. Pipeline

```
worker: Hunt scheduler (every few min, app open or not)
  -> marketplace search -> match -> AI analysis
  -> alert eligibility (strength, confidence, freshness, Hunt LIVE, match NEW)
  -> Alert (unique per deal) + NotificationDelivery rows (IN_APP sent; PUSH / EMAIL pending per preferences)
  -> outbox dispatcher (FOR UPDATE SKIP LOCKED, retries with backoff)
       -> ACCESS GATE (account suspended? Source access incl. grace? Hunt still LIVE within the plan limit?)
       -> push sender -> one message per active device -> Expo Push Service -> APNs / FCM
  -> push maintenance (every 5 min): Expo receipts ~15 min later; stale devices disabled
phone: tap -> open the deal (validated ids) -> mark the alert read
```

- **Monitoring is on the server.** The worker runs regardless of the phone and is limited only by
  the account's access. A sweep every 5 minutes pauses Hunts above the plan, and the access gate
  repeats the check right before every push.
- **Where the code is:**
  - `apps/worker/src/notifications/`: `alert-writer`, `notification-dispatcher`, `alert-gate`,
    `push/*` (provider interface, Expo, simulator, sender, maintenance).
  - `apps/api/src/modules/notifications/`: devices, preferences, inbox, dev tools.
  - `apps/mobile/src/notifications/`: registration, the tap bridge, the push card.
  - `packages/client-core/src/notification-target.ts`: tap validation and pending taps.

## 2. Rules

| Rule | How |
|---|---|
| Register / refresh | The app registers after the person allows notifications (never prompted on launch). It refreshes silently on every sign-in / launch while allowed, and again when the OS rotates the token (`addPushTokenListener`) |
| One account per device | Registering a token moves it to the signed-in account. Sign-out removes this phone's registration first (step 81) |
| Stale tokens | Disabled when Expo reports `DeviceNotRegistered` in the ticket **or the receipt** (receipts fetched ~15 min later; no receipt after 24 h = "unknown"). Also disabled when the phone hasn't refreshed for `PUSH_DEVICE_STALE_DAYS` (default 90), which covers uninstalled apps and long-expired sessions |
| Preferences | Per category and channel (`/me/notification-preferences`). Push is on by default for deal alerts, exceptional deals and service messages. Marketing and weekly insights are opt-in. The in-app inbox always records the alert |
| Entitlement | Deal / exceptional pushes go out only if the account isn't suspended, still has Source access (the shared `@rein-drop/access` resolver, including `BILLING_GRACE_DAYS`), and the Hunt is still LIVE after enforcing the plan's live-Hunt limit **at send time**. Otherwise the push is SKIPPED (`account_suspended` / `no_access` / `hunt_not_live`) and the inbox entry stays |
| No duplicates | One alert per deal (unique `dedupeKey`) and one delivery per channel. Each delivery is finalised once. The app shows a foreground alert once, skips the deal already on screen, handles each tap once, and clears the cold-start response. **Remaining:** a worker crash after Expo accepts but before the status is saved can resend once (Expo has no idempotency key). The same listing found by two Hunts alerts once per Hunt |
| Payload | `data = { alertId, category, dealId }`: opaque ids only, no auth tokens, credentials, e-mail or account data. The app validates the ids and opens the inbox for anything else. The **visible** title / body contain the listing title, the AI headline, the marketplace and the Hunt name, and show on the lock screen (see section 6) |
| Expired session / deleted deal | A tap that arrives while signed out waits and opens after sign-in, never for a different account. A deal that was deleted or belongs to another account shows "Deal not found". A device whose session expired keeps receiving that account's pushes until the stale-device limit, a new sign-in, or sign-out |

## 3. Development (no accounts or keys needed)

- **Simulated push:** in Expo Go (Android can't load push since SDK 53), on simulators, and in
  builds without an EAS project id, the phone registers a `dev-simulated:<uuid>` device. The worker
  "sends" through the simulator: log lines `[simulated push] -> …<last 6 of token>` (tokens
  masked), deliveries stored as SIMULATED.
- **Simulator log:** web `/dev/notifications` (every delivery with status and reason).
- **Test push:** in development the mobile Account tab's **Developer** card has **Send a test
  notification** (`POST /dev/notifications/test`, 404 in production). It sends an alert through the
  normal outbox that opens your latest deal, or the inbox. On a development build with
  `PUSH_PROVIDER=expo` it arrives as a real notification.
- **Worker settings:**
  - `PUSH_PROVIDER=simulator` (default in development) or `expo`;
  - `EXPO_ACCESS_TOKEN` only with "enhanced push security";
  - `PUSH_DEVICE_STALE_DAYS`.

## 4. Setup still needed (owner) - nothing below is invented in code

### Shared
1. **Expo account and project:** run `eas init` in `apps/mobile`. Set `EAS_PROJECT_ID` (read by
   `app.config.ts`) for builds.
2. **App identifier:** choose it, e.g. `com.yourcompany.reindrop`, and set `APP_BUNDLE_ID` (used as
   the iOS bundle id and the Android package). It is permanent once published.
3. **Builds:** push needs a **development build or store build**, not Expo Go (`eas build --profile
   development`). An `eas.json` with development / preview / production profiles doesn't exist yet.
4. **Worker in production:** `PUSH_PROVIDER=expo`, and `EXPO_ACCESS_TOKEN` (Key Vault) if you turn on
   enhanced push security.

### Android (FCM v1)
1. Create a Firebase project and add an Android app with the package = `APP_BUNDLE_ID`.
2. Download `google-services.json`. Keep it out of git (ignored) and point `GOOGLE_SERVICES_FILE` at it.
3. Upload a Firebase **service account key** (FCM V1) to Expo: `eas credentials`, then Android, then
   Push notifications.
4. The app creates the `alerts` notification channel (high importance) on first use. Android 13+
   asks for permission when the person turns notifications on.

### iOS (APNs)
1. Get an Apple Developer Program membership.
2. Create an **APNs key** (.p8). Never commit it (`*.p8` is ignored). Let `eas credentials` /
   `eas build` create or upload it; EAS manages push credentials for the bundle id.
3. Push capability: EAS sets it up from the config plugin.
4. Permission is asked only from the "Hunt is live" prompt or Settings, never on launch.

## 5. Manual device-testing checklist

Run on **one Android and one iPhone development build** with `PUSH_PROVIDER=expo` on the worker,
signed in with a test account that has a LIVE Hunt.

| # | Check | Expected |
|---|---|---|
| 1 | Fresh install, sign in | No permission prompt on launch |
| 2 | Start watching a Hunt, then Turn on notifications in the prompt | OS permission dialog; the Account card shows "On" |
| 3 | Account, Developer, Send a test notification (app **open**) | Banner appears once; tapping it opens your latest deal; the inbox entry is read |
| 4 | Same with the app **in the background** | Notification in the tray; tap opens the deal |
| 5 | Same with the app **closed** (swiped away) | Tap launches the app straight into the deal; relaunching later does NOT reopen it |
| 6 | Send again while that deal is on screen | No banner (already looking at it); the inbox still has it |
| 7 | Wait for a real qualified deal (or seed one) | Push titled "Strong deal: …" opens that deal |
| 8 | Turn deal-alert push off in Account, Notifications | Next deal: inbox only; the delivery shows SKIPPED `disabled_by_preference` in `/dev/notifications` |
| 9 | Pause the Hunt, then trigger a deal for it | No push (`hunt_not_live`) |
| 10 | Suspend the account (SQL, ACCESS_RULES.md section 2), then send a deal | No push (`account_suspended`); the test push (operational) still arrives |
| 11 | Sign out | That phone stops getting the account's pushes; sign in as another account and the pushes follow |
| 12 | Let the session expire (or revoke it), then tap a notification | Sign-in screen; after signing in, the deal opens |
| 13 | Tap a notification for a deleted deal | "Deal not found" message, no crash |
| 14 | Uninstall the app, then send a push | Within ~15-30 minutes the device is disabled (`device_not_registered`, from the receipt) |
| 15 | Android: Settings, then Notifications for the app | "Deal alerts" channel exists, high importance |
| 16 | Airplane mode, then send, then reconnect | Delivered when back online (APNs / FCM queue); tap still opens the deal |

## 6. Open items

- **Lock-screen content:** decide whether the Hunt name and listing title should be hidden on the
  lock screen (e.g. "New deal for your Hunt"). That is a privacy choice for you.
- **Rich notifications:** a deal image, and iOS thread / Android group by Hunt.
- **Quiet hours / caps / digests:** D22.
- **A real email provider:** D14.
- **Collapse keys**, so a resent push replaces the earlier one.
