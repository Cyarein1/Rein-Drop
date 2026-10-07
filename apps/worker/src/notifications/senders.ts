import { Logger } from '@nestjs/common';
import type { NotificationCategory } from '@rein-drop/contracts';

export interface NotificationMessage {
  deliveryId: string;
  alertId: string;
  channel: 'PUSH' | 'EMAIL';
  category: NotificationCategory;
  title: string;
  body: string | null;
  recipient: { userId: string; email: string };
}

/**
 * One external channel (push or email). Real providers implement this later (Expo push:
 * Build Prompt 25; email provider TBD). `send` throws to signal failure; the dispatcher retries.
 */
export interface NotificationSender {
  /** Stored as NotificationDelivery.provider. */
  readonly id: string;
  /** True for the local simulator: deliveries become SIMULATED, never SENT. */
  readonly simulated: boolean;
  send(message: NotificationMessage): Promise<void>;
}

/**
 * Local simulator: "delivers" by writing a log line. Together with the NotificationDelivery rows
 * (status SIMULATED) this is the notification log, so the whole pipeline runs without Expo push
 * or an email provider. Never used in production (worker config refuses it).
 */
export class SimulatedSender implements NotificationSender {
  readonly id = 'simulator';
  readonly simulated = true;
  private readonly logger = new Logger('NotificationSimulator');
  /** Messages "sent" by this instance (handy in tests). */
  readonly sent: NotificationMessage[] = [];

  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`[simulated ${message.channel.toLowerCase()}] to ${message.recipient.email}: ${message.title}${message.body ? ` - ${message.body}` : ''}`);
  }
}

export type NotificationSenders = Partial<Record<'PUSH' | 'EMAIL', NotificationSender>>;

/** `simulator`: both channels simulated. `disabled`: no external channel (deliveries SKIPPED). */
export function createNotificationSenders(mode: 'simulator' | 'disabled'): NotificationSenders {
  if (mode === 'disabled') return {};
  return { PUSH: new SimulatedSender(), EMAIL: new SimulatedSender() };
}
