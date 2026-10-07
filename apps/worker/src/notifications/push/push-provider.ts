/**
 * The push boundary. Everything else (devices, alerts, preferences, the outbox) is provider-
 * independent: Expo's push service today; direct APNs / FCM or Azure Notification Hubs later are
 * new implementations of this interface, chosen in config - nothing else changes.
 */

export interface PushMessage {
  /** The device's token, in the provider's own format. */
  to: string;
  title: string;
  body: string | null;
  /** Small JSON payload for the app (e.g. which deal to open). */
  data: Record<string, string>;
  /** Android notification channel (created by the app). */
  channelId: string;
}

/** Why one message wasn't accepted. */
export type PushErrorCode =
  /** The token is no longer valid (app uninstalled, permission revoked): stop using the device. */
  | 'device_not_registered'
  | 'message_too_big'
  | 'rate_limited'
  /** Provider credentials are wrong: an operator problem, retrying won't help. */
  | 'invalid_credentials'
  /** Network / provider outage. */
  | 'unavailable'
  | 'other';

export type PushTicket = { status: 'ok'; id: string | null } | { status: 'error'; code: PushErrorCode; message: string; retryable: boolean };

export interface PushProvider {
  /** Stored as NotificationDelivery.provider. */
  readonly id: string;
  /** True when nothing really leaves the machine (deliveries become SIMULATED). */
  readonly simulated: boolean;
  /** One ticket per message, in order. Never throws for per-message problems. */
  send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
}
