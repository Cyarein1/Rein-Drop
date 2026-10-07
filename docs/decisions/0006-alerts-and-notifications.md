# 0006 - Alerts: one per deal, written with the analysis; deliveries through an outbox

_Status: accepted for the implementation (2026-10-07). Default preference values are proposed
defaults pending product confirmation._

## Context

Build Prompt 24: notification preferences, Alert and NotificationDelivery; when an eligible
DealAnalysis is created, generate at most the intended alert once; a local simulator / log /
in-app inbox so the whole pipeline is testable without Expo push or email; operational and deal
alerts separate from marketing. App Flow Blueprint section 17: alerts only when a candidate
clears user + Rein Drop thresholds; notification precision is a product metric.

## Decision

- **Alert = one intended notification** (what the inbox lists), unique `dedupeKey`
  (`deal:<huntMatchId>`): a deal alerts at most once, ever - re-analysis, retried jobs, new
  search runs and the next day's re-scoring never alert again. Not upgraded later (a deal first
  alerted as strong that later scores exceptional does not alert twice).
- **Created in the same transaction as the eligible DealAnalysis** (worker `writeDealAlert`,
  `INSERT ... ON CONFLICT DO NOTHING`), after re-checking the match is still NEW (an Ignore or
  Bought made while the AI ran wins).
- **NotificationDelivery = one row per channel**: IN_APP is SENT on creation (the inbox reads
  Alert rows); channels the user turned off are SKIPPED (`disabled_by_preference`); the rest are
  PENDING.
- **Outbox**: the worker's NotificationDispatcher claims due PENDING rows (`FOR UPDATE SKIP
  LOCKED`, lease), sends through a `NotificationSender` per channel, and records SENT / SIMULATED /
  FAILED (after max attempts, with backoff) or SKIPPED (`not_configured`). Nothing is lost if the
  process dies between writing and sending. On Azure the same table can stay the outbox, or feed
  a queue.
- **Local simulator**: `NOTIFICATION_DELIVERY=simulator` (development default) logs each push /
  email (`[simulated push] to ...`) and marks it SIMULATED; production must set the variable and
  refuses `simulator`. The delivery rows are the log (`GET /dev/notifications`, web
  `/dev/notifications`, both development only).
- **Preferences** per (category, channel), stored only when the user changes something;
  defaults in `NOTIFICATION_RULES` (contracts):

  | Category | Group | Inbox | Push | Email |
  |---|---|---|---|---|
  | Deal alerts | alerts | always | on | off |
  | Exceptional deals | alerts | always | on | off |
  | Hunt and source issues | alerts | always | on | off |
  | Weekly insight | insights | - | off | off |
  | Product news and offers | marketing | - | off | off |

  Marketing is its own group, opt-in only, never in the inbox, and never affects service alerts.

## Consequences

- Precision first: Ignore / Bought before the alert is written suppresses it; a deal never
  alerts twice.
- Push / email reach nobody until providers exist (Expo push: Build Prompt 25; email TBD).
- TODO(product): confirm defaults; quiet hours, per-Hunt caps / digests, the weekly insight and
  operational alerts (source degraded long enough to matter - Build Prompt 32) are not generated yet.
