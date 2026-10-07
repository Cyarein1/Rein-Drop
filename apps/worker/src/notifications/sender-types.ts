import type { NotificationCategory } from '@rein-drop/contracts';

export interface NotificationMessage {
  deliveryId: string;
  alertId: string;
  channel: 'PUSH' | 'EMAIL';
  category: NotificationCategory;
  title: string;
  body: string | null;
  /** The deal to open (HuntMatch id), when the alert is about one. */
  dealId: string | null;
  recipient: { userId: string; email: string };
}

/** What a sender reports for a delivered message. */
export interface SendResult {
  /** Stored as NotificationDelivery.provider. */
  provider: string;
  /** True when nothing left the machine: the delivery becomes SIMULATED rather than SENT. */
  simulated: boolean;
}

/**
 * Thrown by a sender when this delivery can't happen and retrying won't change that
 * (e.g. the user has no phone registered): the delivery is marked SKIPPED with the reason.
 */
export class DeliverySkipped extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'DeliverySkipped';
  }
}

/**
 * One external channel (push or email). `send` resolves when the message was handed over,
 * throws DeliverySkipped when it can't apply, and throws anything else to be retried.
 */
export interface NotificationSender {
  send(message: NotificationMessage): Promise<SendResult>;
}
