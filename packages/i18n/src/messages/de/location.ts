import type en from '../en/location.js';
import type { Messages } from '../types.js';

/** German (DRAFT - needs native review, see docs/i18n/README.md) - area: location. */
export default {
  mapCaptionRadius: 'Deals im Umkreis von {radius} {unit} um {place}. Zieh die Markierung, um den Mittelpunkt anzupassen.',
  mapCaptionCentre: 'Mittelpunkt: {place}. Füge einen Umkreis hinzu, um nur Deals in der Nähe zu sehen. Zieh die Markierung zum Anpassen.',
  errorRadiusNeedsLocation: 'Füge einen Ort für den Umkreis hinzu',

  tipSaveArea: 'Tipp: Speichere deine Region in den Einstellungen, dann füllst du das nächstes Mal mit einem Tipp aus.',
  suggestionsBelow: '{count, plural, one {# Vorschlag unten} other {# Vorschläge unten}}',
  suggestionsUnavailable: 'Vorschläge sind gerade nicht verfügbar – du kannst den Ort trotzdem eintippen.',
  suggestionsFor: 'Vorschläge für {label}',
  selected: '{place} ausgewählt',
  use: '{place} verwenden',
  useMyArea: 'Meine Region verwenden: {place}',
  mapA11y: 'Karte. {caption}',
  pinTitle: 'Mittelpunkt des Hunts',
  pinDescription: 'Zum Verschieben ziehen',

  areaLabel: 'Stadtteil, Ort oder Postleitzahl',
  areaHint: 'Nicht deine Straßenadresse – wird nur genutzt, um vorzuschlagen, wo deine Hunts suchen.',
  areaErrorShort: 'Gib einen Stadtteil, Ort oder eine Postleitzahl ein',
  areaSaved: 'Gespeichert. Neue Hunts können sie mit einem Tipp übernehmen.',
  areaSavedText: 'Als Text gespeichert – wir konnten den Ort nicht auf der Karte finden, daher lässt sich die Entfernung nicht prüfen. Wähl am besten einen Vorschlag aus.',
  areaSaveFailed: 'Deine Region konnte nicht gespeichert werden. Bitte versuch es noch einmal.',
  areaRemoved: 'Deine Region wurde entfernt.',
  areaRemoveFailed: 'Deine Region konnte nicht entfernt werden. Bitte versuch es noch einmal.',
  areaCaption: 'Mittelpunkt von {place}. Zieh die Markierung zum Anpassen.',
  areaCaptionEmpty: 'Mittelpunkt deiner Region. Zieh die Markierung zum Anpassen.',
  areaSave: 'Region speichern',
  areaRemove: 'Entfernen',
} satisfies Messages<typeof en>;
