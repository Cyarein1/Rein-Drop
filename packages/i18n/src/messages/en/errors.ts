/** English source text - area: errors. Keys are stable ids; text can change freely. */
export default {
  /** Generic title above an error message from the server. */
  actionFailed: "That didn't work",
  /** The session is kept, but its token couldn't be refreshed (sign-in service unreachable). */
  signInServiceUnreachable: "Couldn't reach the sign-in service. Check your connection - you're still signed in.",
  loadMoreFailed: "Couldn't load more: {message}",
} as const;
