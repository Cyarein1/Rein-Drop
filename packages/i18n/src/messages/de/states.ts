import type en from '../en/states.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: states. */
export default {
  firstScanTitle: 'Rein Drop prüft zum ersten Mal',
  firstScanBody: 'Rein Drop durchsucht {names} nach Angeboten, die zu deinem Hunt passen. Das dauert meist ein bis zwei Minuten – diese Seite aktualisiert sich von selbst.',
  firstScanDone: '{name}: fertig {age}',
  firstScanChecking: '{name}: wird geprüft…',

  noDealsTitle: 'Beobachtung läuft – noch kein Treffer',
  noDealsBody: 'Alles funktioniert. Rein Drop prüft weiter und sagt dir Bescheid, sobald etwas deine Kriterien erfüllt – bei einem bestimmten Artikel kann das eine Weile dauern.',
  noDealsBodyLong: 'Dein Hunt ist seit {days, plural, one {# Tag} other {# Tagen}} aktiv, ohne Treffer. Ein höherer Höchstpreis, mehr Zustände oder ein größerer Umkreis können helfen.',
  nextCheck: 'Nächste Prüfung {when}',
  broadenCriteria: 'Kriterien erweitern',
  tuneCriteria: 'Kriterien anpassen',
  reviewHunts: 'Deine Hunts prüfen',

  reducedPlanTitleWeb: 'Prüfung im Takt deines Plans',
  reducedPlanTitleCompanion: 'Prüfung im Takt deines Zugangs',
  reducedQuietTitle: 'Ruhezeit – seltenere Prüfungen',
  reducedPlanBodyWeb: 'Dein Plan prüft Marktplätze {hasCadence, select, yes {alle {minutes} Min.} other {seltener}}. Starke Deals erreichen dich trotzdem, sobald sie gefunden werden.',
  reducedPlanBodyCompanion: 'Dein aktueller Zugang prüft Marktplätze {hasCadence, select, yes {alle {minutes} Min.} other {seltener}}. Starke Deals erreichen dich trotzdem, sobald sie gefunden werden.',
  reducedQuietBody:
    'Rein Drop prüft nachts {hasCadence, select, yes {alle {minutes} Min.} other {seltener}}{hasResumes, select, yes { und kehrt um {resumes} zum normalen Takt zurück} other {}}. Starke Deals erreichen dich trotzdem, sobald sie gefunden werden.',
  seePlans: 'Pläne ansehen',

  planLimitTitleWeb: 'Dein Plan beobachtet {limit, plural, one {# Hunt} other {# Hunts}} gleichzeitig',
  planLimitTitleCompanion: 'Dein aktueller Zugang beobachtet {limit, plural, one {# Hunt} other {# Hunts}} gleichzeitig',
  planLimitBodyWeb:
    '{drafts, plural, =1 {„{draft}“ ist gespeichert und bereit} other {# Entwürfe sind gespeichert und bereit}}. Pausiere {live, plural, =1 {„{liveName}“} other {einen aktiven Hunt}}, um stattdessen {drafts, plural, =1 {diesen} other {einen davon}} zu beobachten, oder wechsle auf einen größeren Plan, um mehr zu beobachten. So oder so geht nichts verloren.',
  planLimitBodyCompanion:
    '{drafts, plural, =1 {„{draft}“ ist gespeichert und bereit} other {# Entwürfe sind gespeichert und bereit}}. Pausiere {live, plural, =1 {„{liveName}“} other {einen aktiven Hunt}}, um stattdessen {drafts, plural, =1 {diesen} other {einen davon}} zu beobachten. Es geht nichts verloren.',
  seeOptions: 'Optionen ansehen',
  manageLiveHunts: 'Aktive Hunts verwalten',

  cancelTitleFree: 'Du nutzt den {plan}-Plan',
  cancelTitle: '{plan} kündigen?',
  cancelBodyFree: 'Es gibt nichts zu kündigen – der Free-Plan kostet dich nie etwas.',
  cancelBody: 'Schade, dass du gehst. Hier steht genau, was passiert – ohne Überraschungen:',
  cancelKeepUntilDate: 'Du behältst {plan} bis {date} – dem Ende des Zeitraums, den du bezahlt hast. Dir wird nichts mehr berechnet.',
  cancelKeepUntilEnd: 'Du behältst {plan} bis zum Ende des Zeitraums, den du bezahlt hast. Dir wird nichts mehr berechnet.',
  cancelHuntsKept: 'Deine Hunts bleiben erhalten – es wird nie etwas gelöscht.',
  cancelMoveToFree: 'Danach wechselst du zu Free: Aktive Hunts über dessen Limit werden pausiert, die zuletzt gestarteten zuerst. Du kannst sie jederzeit fortsetzen oder wieder upgraden.',
  cancelDataStays: 'Dein Bestand, deine Verkäufe und deine Auswertungen bleiben genau so, wie sie sind.',
  backToSettings: 'Zurück zu den Einstellungen',
  keepMyPlan: 'Meinen Plan behalten',
  cancelUnavailable: 'Dieser Plan kann hier nicht online gekündigt werden (er wurde nicht über den Web-Checkout von Rein Drop gekauft). Es wird nichts berechnet.',


  loadingList: '{what, select, deals {Deine Deals werden geladen …} hunts {Deine Hunts werden geladen …} inventory {Dein Bestand wird geladen …} listings {Deine Angebote werden geladen …} other {Wird geladen …}}',
  loadFailedList: '{what, select, deals {Deine Deals konnten nicht geladen werden} hunts {Deine Hunts konnten nicht geladen werden} inventory {Dein Bestand konnte nicht geladen werden} listings {Deine Angebote konnten nicht geladen werden} other {Das konnte nicht geladen werden}}',
  showingEarlier: 'Angezeigt wird der zuletzt geladene Stand',
  refreshFailed: 'Aktualisieren fehlgeschlagen. {message}',
} satisfies Messages<typeof en>;
