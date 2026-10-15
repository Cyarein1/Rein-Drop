import type en from '../en/auth.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: auth. */
export default {
  signingIn: 'Du wirst angemeldet …',
  signInTitle: 'Bei Rein Drop anmelden',
  signInHelp: 'Melde dich mit deinem Rein-Drop-Konto an. Du gibst deine E-Mail-Adresse und dein Passwort auf einer sicheren Microsoft-Seite ein.',
  signIn: 'Anmelden',
  sessionEndedTitle: 'Deine Sitzung ist abgelaufen',
  notSignedInTitle: 'Du bist nicht angemeldet',
  cantReachTitle: 'Rein Drop ist nicht erreichbar',
  cantReachHelp: 'Prüfe deine Verbindung und versuche es erneut. An deinem Konto hat sich nichts geändert.',
  openSettings: 'Einstellungen öffnen',

  sessionEnded: 'Deine Sitzung ist abgelaufen. Melde dich erneut an, um weiterzumachen - deine Hunts, dein Bestand und deine Deals bleiben erhalten.',
  signInToContinue: 'Melde dich an, um fortzufahren.',
  signedOut: 'Du bist abgemeldet.',
  signInIncomplete: 'Die Anmeldung wurde nicht abgeschlossen. Bitte versuche es erneut.',
  devSignInUnavailable: 'Die Entwickler-Anmeldung ist in diesem Build nicht verfügbar.',
  unknownProvider: 'Unbekannter Anmeldeanbieter „{name}“.',
  notConfigured: 'Die Anmeldung ist in diesem Build nicht eingerichtet ({missing}).',
} satisfies Messages<typeof en>;
