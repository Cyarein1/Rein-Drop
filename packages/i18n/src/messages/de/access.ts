import type en from '../en/access.js';
import type { Messages } from '../types.js';

/**
 * German (DRAFT - needs native review, see docs/i18n/README.md) - area: access. NEUTRAL ONLY
 * (decision 0018): no Preis, Tarif wählen, Upgrade, Abo, kaufen, bezahlen, Checkout or „im Web“.
 */
export default {
  summaryUnlimited: 'Dein aktueller Zugang umfasst unbegrenzt viele aktive Hunts ({used} in Nutzung).',
  summaryLimit: '{limit, plural, one {Dein aktueller Zugang umfasst # aktiven Hunt ({used} in Nutzung).} other {Dein aktueller Zugang umfasst # aktive Hunts ({used} in Nutzung).}}',
  reasonHuntLimit:
    '{limit, plural, one {Dein aktueller Zugang umfasst # aktiven Hunt} other {Dein aktueller Zugang umfasst # aktive Hunts}}, und {used, plural, one {# ist aktiv} other {# sind aktiv}}. Pausiere einen anderen Hunt, um diesen zu beobachten – er bleibt als Entwurf gespeichert.',
  reasonMarketplace:
    '{count, plural, one {Dein aktueller Zugang umfasst {names} nicht. Entferne ihn aus diesem Hunt, um die Beobachtung zu starten.} other {Dein aktueller Zugang umfasst {names} nicht. Entferne sie aus diesem Hunt, um die Beobachtung zu starten.}}',
  reasonPriority: 'Dein aktueller Zugang umfasst diese Beobachtungspriorität nicht. Stelle den Hunt auf normale Priorität, um die Beobachtung zu starten.',
  listAnd: '{items} und {last}',
  accountSite: 'Du kannst dein Konto unter {host} verwalten.',
  noPaidAccess: 'Dieses Konto hat derzeit keinen Zugang zu kostenpflichtigen Funktionen.',
  dataKept: 'Deine Hunts, dein Bestand und deine gemerkten Deals bleiben erhalten.',
  dataKeptPaused: 'Deine Hunts, dein Bestand und deine gemerkten Deals bleiben erhalten. Hunts über den enthaltenen Umfang hinaus sind jetzt pausiert, nicht gelöscht.',
  labelSuspended: 'Gesperrt',
  suspendedLine: 'Der Zugang zu diesem Konto wurde von Rein Drop gesperrt, daher werden keine Hunts beobachtet.',
  labelActive: 'Aktiv',
  continuesUntil: 'Dein aktueller Zugang läuft bis {date}.',
  planActive: 'Dein {plan}-Zugang ist aktiv.',
  accessActive: 'Dein Zugang ist aktiv.',
  labelTrial: 'Testphase',
  trialUntil: 'Dein Testzugang läuft bis {date}.',
  trialActive: 'Dein Testzugang ist aktiv.',
  labelNeedsAttention: 'Bitte prüfen',
  needsAttentionLine: 'Dein Konto braucht deine Aufmerksamkeit. Dein aktueller Zugang läuft vorerst weiter.',
  continuesShort: 'Dein aktueller Zugang läuft noch kurze Zeit weiter.',
  labelFree: 'Free',
  usageLive: 'Aktive Hunts: {used} von {limit}',
  usageLiveUnlimited: 'Aktive Hunts: {used} (unbegrenzt)',
  usageSaved: 'Gespeicherte Hunts: {used} von {limit}',
  usageSavedUnlimited: 'Gespeicherte Hunts: {used} (unbegrenzt)',

  titleSuspended: 'Zugang gesperrt',
  titleNeedsAttention: 'Dein Konto braucht deine Aufmerksamkeit',
  titleNoPaidAccess: 'Kein Zugang zu kostenpflichtigen Funktionen',
} satisfies Messages<typeof en>;
