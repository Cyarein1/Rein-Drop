/** English source text - area: states. Keys are stable ids; text can change freely. */
export default {
  // First scan
  firstScanTitle: 'Rein Drop is checking for the first time',
  firstScanBody: "It's looking through {names} for listings that fit your Hunt. This usually takes a minute or two, and this page updates by itself.",
  firstScanDone: '{name}: done {age}',
  firstScanChecking: '{name}: checking…',

  // No deals yet while healthy
  noDealsTitle: 'Watching - nothing has matched yet',
  noDealsBody: 'Everything is working. Rein Drop keeps checking and tells you when something clears your criteria - that can take a while for a specific item.',
  noDealsBodyLong: 'Your Hunt has been live for {days, plural, one {# day} other {# days}} without a match. A higher max price, more conditions or a wider area can help.',
  nextCheck: 'Next check {when}',
  broadenCriteria: 'Broaden criteria',
  tuneCriteria: 'Tune criteria',
  reviewHunts: 'Review your Hunts',

  // Reduced monitoring
  reducedPlanTitleWeb: 'Checking at your plan’s pace',
  reducedPlanTitleCompanion: 'Checking at your access’s pace',
  reducedQuietTitle: 'Quiet hours - checking less often',
  reducedPlanBodyWeb: "Your plan checks marketplaces {hasCadence, select, yes {every {minutes} min} other {less often}}. Strong deals still reach you as soon as they're found.",
  reducedPlanBodyCompanion: "Your current access checks marketplaces {hasCadence, select, yes {every {minutes} min} other {less often}}. Strong deals still reach you as soon as they're found.",
  reducedQuietBody:
    "Rein Drop checks {hasCadence, select, yes {every {minutes} min} other {less often}} overnight{hasResumes, select, yes { and goes back to normal at {resumes}} other {}}. Strong deals still reach you as soon as they're found.",
  seePlans: 'See plans',

  // Plan limit with drafts waiting ({draft} / {liveName} are Hunt names)
  planLimitTitleWeb: 'Your plan watches {limit, plural, one {# Hunt} other {# Hunts}} at a time',
  planLimitTitleCompanion: 'Your current access watches {limit, plural, one {# Hunt} other {# Hunts}} at a time',
  planLimitBodyWeb:
    '{drafts, plural, =1 {"{draft}" is saved and ready} other {# drafts are saved and ready}}. Pause {live, plural, =1 {"{liveName}"} other {a live Hunt}} to watch {drafts, plural, =1 {it} other {one}} instead, or upgrade to watch more. Nothing is lost either way.',
  planLimitBodyCompanion:
    '{drafts, plural, =1 {"{draft}" is saved and ready} other {# drafts are saved and ready}}. Pause {live, plural, =1 {"{liveName}"} other {a live Hunt}} to watch {drafts, plural, =1 {it} other {one}} instead. Nothing is lost.',
  seeOptions: 'See options',
  manageLiveHunts: 'Manage live Hunts',

  // Cancellation ({plan} = plan name, never translated)
  cancelTitleFree: "You're on the {plan} plan",
  cancelTitle: 'Cancel {plan}?',
  cancelBodyFree: 'There is nothing to cancel - the Free plan never charges you.',
  cancelBody: "We're sorry to see you go. Here's exactly what happens, so there are no surprises:",
  cancelKeepUntilDate: "You keep {plan} until {date} - the end of the period you've paid for. You won't be charged again.",
  cancelKeepUntilEnd: "You keep {plan} until the end of the period you've paid for. You won't be charged again.",
  cancelHuntsKept: 'Your Hunts are kept - nothing is ever deleted.',
  cancelMoveToFree: 'After that you move to Free: live Hunts above its limit are paused, the most recently started first. You can resume them or upgrade again any time.',
  cancelDataStays: 'Your inventory, sales and analytics stay exactly as they are.',
  backToSettings: 'Back to Settings',
  keepMyPlan: 'Keep my plan',
  cancelUnavailable: 'This plan can’t be cancelled online here (it wasn’t bought through Rein Drop’s web checkout). Nothing will be charged.',


  // List loading (mobile LoadStatus; {what}: deals / hunts / inventory / listings)
  loadingList: '{what, select, deals {Loading your deals…} hunts {Loading your Hunts…} inventory {Loading your inventory…} listings {Loading your listings…} other {Loading…}}',
  loadFailedList: "{what, select, deals {Couldn't load your deals} hunts {Couldn't load your Hunts} inventory {Couldn't load your inventory} listings {Couldn't load your listings} other {Couldn't load this}}",
  showingEarlier: 'Showing what was loaded earlier',
  refreshFailed: "Couldn't refresh. {message}",
} as const;
