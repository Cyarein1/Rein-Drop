# 0002 - Currency, distance unit and language follow the user's locale

- **Status:** Accepted (2026-10-07, product owner).

## Decision

- Display defaults - **country, currency, distance unit (km/mi), language** - come from where the
  user is, detected from the **device locale (mobile) / browser Accept-Language (web)** at first
  sign-in, and can be changed by the user later.
- **Storage stays canonical:** money = integer minor units + ISO-4217 currency; distances = km.
  Apps convert for display (`kmToUnit` / `unitToKm` in `@rein-drop/contracts`).
- Detection only fills an **empty** locale; it never overwrites an existing one (so travelling
  does not flip currency), and a user's own choice is never overwritten.
- Defaults per country: currency from ISO data (`country-to-currency`); miles for US, GB, LR, MM,
  km elsewhere. Language = the locale's language subtag (e.g. `zu-ZA` -> `zu`).
- **UI translation:** only English exists (`SUPPORTED_LANGUAGES = ['en']`); the stored preference
  is kept and `uiLanguage()` falls back to English until more languages are translated.

## Not done / later

- App-store storefront country ("where they downloaded the app") is not readable from Expo
  without a native module - device region is used. Could refine later.
- UI translations (i18n framework, copy extraction) - separate project.
- Settings screen to change locale - with the Settings implementation.

## Where

- Contract: `packages/contracts/src/locale.ts`; API `GET/PUT /me/locale`; `GET /me` includes
  `locale`; columns on `User` (`countryCode`, `currency`, `distanceUnit`, `language`,
  `regionSource`).
