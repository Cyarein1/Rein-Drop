import type en from '../en/account.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: account. */
export default {
  languageTitle: 'Sprache',
  languageHint: 'Rein Drop nutzt die Sprache deines Telefons, bis du hier eine auswählst.',
  languageSaved: 'Gespeichert.',
  languageFailed: 'Nicht gespeichert: {message}',

  placeholder: 'Die meisten Einstellungsbereiche sind aufgeführt, aber noch nicht bearbeitbar.',
  accountTitle: 'Konto',
  devSignIn: 'Entwicklungs-Anmeldung',
  checkingSession: 'Deine Sitzung wird geprüft…',
  devSignedIn: 'Automatisch als lokaler Testnutzer angemeldet (nur in der Entwicklung).',
  switchAccount: 'Um ein anderes Konto zu nutzen, melde dich ab und mit diesem Konto an.',
  signOut: 'Abmelden',
  signIn: 'Anmelden',
  sessionEnded: 'Deine Sitzung ist abgelaufen',
  cantReach: 'Rein Drop ist nicht erreichbar',
  notSignedIn: 'Nicht angemeldet',
  tryAgain: 'Erneut versuchen',
  offline: 'Du bist offline',
  reopenToRetry: 'Verlasse die Einstellungen und öffne sie erneut, um es noch einmal zu versuchen.',
  labelValue: '{label}: {value}',
  areaTitle: 'Deine Region',

  snapshotTitle: 'Verkäuferprofil',
  snapshotSignIn: 'Melde dich an, um deine Antworten aus der Einrichtung zu sehen.',
  snapshotNotStarted: 'Fünf kurze Fragen richten Rein Drop darauf ein, wie du einkaufst.',
  snapshotNotReseller: 'Du hast uns gesagt, dass du gerade nicht weiterverkaufst – dafür kommt bald etwas Passendes.',
  setUpNow: 'Jetzt einrichten',
  notFinished: 'Nicht abgeschlossen',
  snapshotNote: 'Diese Antworten legen die Standardwerte für neue Hunts fest. Bestehende Hunts ändern sich dadurch nie.',
  finishSetup: 'Einrichtung abschließen',
  editAnswers: 'Antworten bearbeiten',

  accessTitle: 'Dein Zugang',
  accessSignIn: 'Melde dich an, um deinen Zugang zu sehen.',
  accessLoading: 'Dein Zugang wird geladen…',
  accessLoadFailed: 'Dein Zugang konnte nicht geladen werden',
  accessUnchanged: 'Dein Zugang hat sich nicht geändert. Versuch es noch einmal, wenn du verbunden bist.',
  accessStale: 'Dein zuletzt bekannter Zugang',
  accessStaleBody: 'Änderungen konnten nicht geprüft werden – vielleicht bist du offline.',

  pushTitle: 'Mitteilungen auf diesem Telefon',
  notificationsTitle: 'Benachrichtigungen',
  notificationsSignIn: 'Melde dich an, um festzulegen, wie Rein Drop dich benachrichtigt.',
  prefsLoading: 'Benachrichtigungseinstellungen werden geladen…',
  prefsLoadFailed: 'Deine Benachrichtigungseinstellungen konnten nicht geladen werden',
  prefsSaved: 'Gespeichert',
  prefsFailed: 'Nicht gespeichert: {message}',
  alwaysOn: '{label} (immer an)',

  settingsTitle: 'Einstellungen',
} satisfies Messages<typeof en>;
