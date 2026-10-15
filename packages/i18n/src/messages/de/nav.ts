import type en from '../en/nav.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: nav. */
export default {
  tabDeals: 'Deals',
  tabHunts: 'Hunts',
  tabInventory: 'Bestand',
  tabAccount: 'Konto',
  create: 'Erstellen',
  createHunt: 'Hunt erstellen',

  titleAccount: 'Konto',
  titleOnboarding: 'Rein Drop einrichten',
  titleHunt: 'Hunt',
  titleEditHunt: 'Hunt bearbeiten',
  titleStartWatching: 'Beobachtung starten',
  titleDeal: 'Deal',
  titleInventoryItem: 'Bestandsartikel',
  titleMarkSold: 'Als verkauft markieren',
  titleSaleResult: 'Verkaufsergebnis',
  titleListings: 'Deine Angebote',
  titleListForSale: 'Zum Verkauf einstellen',
  titleInbox: 'Posteingang',
} satisfies Messages<typeof en>;
