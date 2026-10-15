/** English source text - area: account. Keys are stable ids; text can change freely. */
export default {
  languageTitle: 'Language',
  languageHint: "Rein Drop uses your phone's language until you choose one here.",
  languageSaved: 'Saved.',
  languageFailed: 'Not saved: {message}',

  // Mobile: Account screen
  placeholder: 'Most settings sections are listed but not editable yet.',
  accountTitle: 'Account',
  devSignIn: 'Development sign-in',
  checkingSession: 'Checking your session…',
  devSignedIn: 'Signed in automatically as the seeded local user (development only).',
  switchAccount: 'To use another account, sign out and sign in with it.',
  signOut: 'Sign out',
  signIn: 'Sign in',
  sessionEnded: 'Your session has ended',
  cantReach: "Can't reach Rein Drop",
  notSignedIn: 'Not signed in',
  tryAgain: 'Try again',
  offline: "You're offline",
  reopenToRetry: 'Leave and reopen Settings to try again.',
  labelValue: '{label}: {value}',
  areaTitle: 'Your area',

  // Seller Snapshot card
  snapshotTitle: 'Seller Snapshot',
  snapshotSignIn: 'Sign in to see your onboarding answers.',
  snapshotNotStarted: 'Five quick questions set Rein Drop up around how you source.',
  snapshotNotReseller: "You told us you're not reselling right now - that experience is coming soon.",
  setUpNow: 'Set up now',
  notFinished: 'Not finished',
  snapshotNote: 'These answers set the defaults for new Hunts. Changing them never changes existing Hunts.',
  finishSetup: 'Finish setting up',
  editAnswers: 'Edit answers',

  // Your access card
  accessTitle: 'Your access',
  accessSignIn: 'Sign in to see your access.',
  accessLoading: 'Loading your access…',
  accessLoadFailed: "Couldn't load your access",
  accessUnchanged: "Your access hasn't changed. Try again when you're connected.",
  accessStale: 'Showing your last known access',
  accessStaleBody: "Couldn't check for changes - you may be offline.",

  // Notifications cards
  pushTitle: 'Notifications on this phone',
  notificationsTitle: 'Notifications',
  notificationsSignIn: 'Sign in to choose how Rein Drop alerts you.',
  prefsLoading: 'Loading notification settings…',
  prefsLoadFailed: "Couldn't load your notification settings",
  prefsSaved: 'Saved',
  prefsFailed: 'Not saved: {message}',
  alwaysOn: '{label} (always on)',

  // Account screen sections (step 89 redesign)
  settingsTitle: 'Settings',
} as const;
