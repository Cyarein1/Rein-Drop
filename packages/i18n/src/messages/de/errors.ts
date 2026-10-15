import type en from '../en/errors.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: errors. */
export default {
  actionFailed: 'Das hat nicht geklappt',
  signInServiceUnreachable: 'Der Anmeldedienst ist nicht erreichbar. Prüfe deine Verbindung - du bleibst angemeldet.',
  loadMoreFailed: 'Weitere konnten nicht geladen werden: {message}',
} satisfies Messages<typeof en>;
