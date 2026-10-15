import type en from '../en/home.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: home. */
export default {
  attentionToReview: '{count, plural, one {# Deal zu prüfen} other {# Deals zu prüfen}}',
  attentionUnread: '{count, plural, one {# ungelesene Benachrichtigung} other {# ungelesene Benachrichtigungen}}',
  huntsActive: '{count} aktiv',
  huntsPaused: '{count} pausiert',
  huntsDrafts: '{count, plural, one {# Entwurf} other {# Entwürfe}}',
  periodLastDays: '{days, plural, one {Letzter Tag} other {Letzte # Tage}}',
  otherCurrency: 'Außerdem {amount} realisiert in {currency}',
  captionFirstSale: 'Erscheint nach deinem ersten erfassten Verkauf',
  captionNoSales: 'Keine Verkäufe in diesem Zeitraum',
  captionFromSales: '{count, plural, one {Aus # Verkauf nach erfassten Kosten} other {Aus # Verkäufen nach erfassten Kosten}}',
  recentAlert: 'Benachrichtigung',
  recentBought: 'Gekauft',
  recentSold: 'Verkauft',
} satisfies Messages<typeof en>;
