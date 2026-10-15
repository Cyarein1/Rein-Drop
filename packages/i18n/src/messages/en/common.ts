/** English source text - area: common. Keys are stable ids; text can change freely. */
export default {
  // Relative time (ageText / durationUntilText)
  justNow: 'just now',
  minutesAgo: '{count} min ago',
  hoursAgo: '{count} h ago',
  daysAgo: '{count, plural, one {# day ago} other {# days ago}}',
  now: 'now',
  inMinutes: 'in {count} min',
  inHours: 'in {count} h',
  inDays: '{count, plural, one {in # day} other {in # days}}',

  // Lists ("a, b and c"): {items} is the comma-joined start, {last} the final item
  listAnd: '{items} and {last}',
  listOr: '{items} or {last}',
  /** A quoted word typed by the user, e.g. an exclusion. */
  quoted: '“{text}”',

  // Money fields
  noLimit: 'No limit',
  moneyInvalid: 'Enter an amount like 1500 or 1500.50',
  moneyTooLarge: 'That amount is too large',

  // Connection
  offline: "You're offline or Rein Drop can't be reached right now.",

  // Marketplace source state (decision 0009: calm, never an error)
  sourceDownLabel: 'Not responding',
  sourceNotConfiguredLabel: 'Not set up',
  sourceSlowLabel: 'Slow right now',
  sourcePartialLabel: 'Fewer results',
  sourceRateLimitedLabel: 'Limiting checks',
  sourceTroubleLabel: 'Having trouble',
  sourceDown: "{name} isn't responding right now",
  sourceNotConfigured: "{name} isn't set up",
  sourceSlow: '{name} is slow right now',
  sourcePartial: '{name} is returning fewer results right now',
  sourceRateLimited: '{name} is limiting how often Rein Drop can check',
  sourceTrouble: '{name} is having trouble right now',
  sourceNotConfiguredBody: "Hunts can't search it until it is.",
  sourceNotConfiguredOthers: '{names} {count, plural, one {continues} other {continue}} as normal.',
  sourceOthersContinue: '{names} checks continue as normal.',
  sourceRetryAt: 'Rein Drop tries again {when}; nothing you need to do.',
  sourceRetryAuto: 'Rein Drop retries automatically; nothing you need to do.',
  sourceMayArriveLate: 'New deals from it may arrive late.',
  sourceManyTitle: 'Marketplaces are having trouble right now',
  sourceManyIntro: "{names} aren't fully working.",
  sourceManyRetryAt: 'Rein Drop tries again {when}; your Hunts are safe and nothing you need to do.',
  sourceManyRetryAuto: 'Rein Drop retries automatically; your Hunts are safe and nothing you need to do.',

  // Shared buttons and UI defaults (mobile)
  tryAgain: 'Try again',
  cancel: 'Cancel',
  loading: 'Loading…',
  placeholderTitle: 'Placeholder screen',
  estimated: 'Estimated',
  metricA11y: '{label}: {value}',
  metricA11yEstimated: '{label}, estimated: {value}',
  pullToRefresh: 'Pull to refresh',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  show: 'Show',
  hide: 'Hide',
  inputError: 'Error: {error}',
  datePlaceholder: 'YYYY-MM-DD',
  // Spoken prefix of a status banner ("Warning: title. message")
  bannerSpoken: '{tone, select, success {Success} warning {Warning} error {Error} other {Info}}: {title}',
  bannerSpokenMessage: '{tone, select, success {Success} warning {Warning} error {Error} other {Info}}: {title}. {message}',
} as const;
