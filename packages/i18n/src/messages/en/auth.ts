/** English source text - area: auth (sign-in screen and session messages). Keys are stable ids; text can change freely. */
export default {
  signingIn: 'Signing you in…',
  signInTitle: 'Sign in to Rein Drop',
  signInHelp: "Sign in with your Rein Drop account. You'll continue on a secure Microsoft page to enter your email and password.",
  signIn: 'Sign in',
  sessionEndedTitle: 'Your session has ended',
  notSignedInTitle: "You're not signed in",
  cantReachTitle: "Can't reach Rein Drop",
  cantReachHelp: 'Check your connection and try again. Nothing on your account has changed.',
  openSettings: 'Open Settings',

  // Session messages (shown under the titles above)
  sessionEnded: 'Your session has ended. Sign in again to continue - your Hunts, inventory and deals are kept.',
  signInToContinue: 'Sign in to continue.',
  signedOut: "You're signed out.",
  signInIncomplete: 'Sign-in did not complete. Please try again.',
  devSignInUnavailable: 'Development sign-in is not available in this build.',
  unknownProvider: 'Unknown auth provider "{name}".',
  notConfigured: 'Sign-in is not configured in this build ({missing}).',
} as const;
