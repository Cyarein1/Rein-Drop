/** English source text - area: location. Keys are stable ids; text can change freely. */
export default {
  mapCaptionRadius: 'Deals within {radius} {unit} of {place}. Drag the pin to adjust the centre.',
  mapCaptionCentre: 'Centre: {place}. Add a radius to only see deals nearby. Drag the pin to adjust.',
  errorRadiusNeedsLocation: 'Add a location for the radius',

  // Mobile: location field and map
  tipSaveArea: 'Tip: save your area in Settings to fill this in with one tap next time.',
  suggestionsBelow: '{count, plural, one {# suggestion below} other {# suggestions below}}',
  suggestionsUnavailable: "Suggestions aren't available right now - you can still type the place.",
  suggestionsFor: '{label} suggestions',
  selected: '{place} selected',
  use: 'Use {place}',
  useMyArea: 'Use my area: {place}',
  mapA11y: 'Map. {caption}',
  pinTitle: 'Hunt centre',
  pinDescription: 'Drag to move',

  // Mobile: Your area (Account)
  areaLabel: 'Suburb, town or postal code',
  areaHint: 'Not your street address - only used to suggest where your Hunts look.',
  areaErrorShort: 'Enter a suburb, town or postal code',
  areaSaved: 'Saved. New Hunts can use it with one tap.',
  areaSavedText: "Saved as text - we couldn't find it on the map, so distance can't be checked for it. Try picking a suggestion.",
  areaSaveFailed: "We couldn't save your area. Please try again.",
  areaRemoved: 'Your area was removed.',
  areaRemoveFailed: "We couldn't remove your area. Please try again.",
  areaCaption: 'Centre of {place}. Drag the pin to adjust.',
  areaCaptionEmpty: 'Centre of your area. Drag the pin to adjust.',
  areaSave: 'Save area',
  areaRemove: 'Remove',
} as const;
