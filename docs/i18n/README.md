# Languages (i18n)

Rein Drop speaks **English** (source) and **German** (Germany launch). German is a **draft written
by the build agent - a native German speaker must review it before launch** (owner decision,
2026-10-15). Legal texts (privacy, terms, Impressum) are not machine-drafted: counsel provides them.

## How the language is chosen
- **Stored per person:** the `UserLocale.language` field. It's detected from the device / browser at
  first sign-in and changed in Account / Settings → Language (`PUT /me/locale { language }`).
- **Before sign-in** (sign-in screen, landing page), the device / browser language is used.
- **Mapping:** `resolveLanguage()`: "de", "de-AT", "de-CH" → German; anything else → English.
- **Formatting:** numbers, money and dates follow the full locale tag (e.g. `de-DE`); the text
  follows the UI language.

## How text is written in code
- **All UI text lives in `packages/i18n/src/messages/<lang>/<area>.ts`.** English is the source of
  truth; German must have exactly the same keys and placeholders (enforced by `i18n.spec.ts`).
- **Placeholders:** `{name}`.
- **Plurals:** `{count, plural, one {# Hunt} other {# Hunts}}`.
- **Choices:** `{kind, select, ebay {…} other {…}}`. Never build sentences by concatenating
  translated fragments - use one message with placeholders.
- **Shared view logic** (`packages/client-core`) translates with `ctx.t(...)` - the `t` in
  `HuntFormContext` (`huntFormContext(locale)` / `displayContext()` in tests).
- **Mobile:** `const t = useT()` (`apps/mobile/src/i18n/useT.ts`).
- **Web:** step 89.
- **Keys** are stable ids (`deals.justDropped`); change the English text freely, never reuse a key
  for a different meaning.
- **Not translated:** brand and plan names (Rein Drop, Free / Pro / Ultimate), marketplace names
  (eBay, Facebook Marketplace), user content (Hunt names, listing titles, notes), developer-only
  screens.

## Review status
`TRANSLATION_STATUS.de = 'draft'` in `packages/i18n/src/translator.ts`. After the native review,
set it to `'reviewed'` and record the reviewer and date here.

| Language | Status | Reviewer | Date |
|---|---|---|---|
| English | source | - | - |
| German | **draft - needs native review** | - | - |

Glossary and tone: [GLOSSARY_DE.md](GLOSSARY_DE.md).
