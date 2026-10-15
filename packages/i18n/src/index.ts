/**
 * UI text in every supported language: English (source) and German (draft). Typed keys, a small
 * ICU-style formatter (placeholders, plural, select). Used by web, mobile, API and worker.
 * How to add text: docs/i18n/README.md.
 */
export { formatMessage, messageArguments, type MessageValues } from './format.js';
export { isLanguage, LANGUAGE_NAMES, LANGUAGES, resolveLanguage, translator, TRANSLATION_STATUS, type Language, type MessageKey, type Translator } from './translator.js';
export { en, type Catalog } from './messages/en/index.js';
export { de } from './messages/de/index.js';
