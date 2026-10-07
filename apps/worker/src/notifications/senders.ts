import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@rein-drop/db';
import { ExpoPushProvider } from './push/expo-push-provider.js';
import { PushNotificationSender } from './push/push-sender.js';
import type { PushProvider } from './push/push-provider.js';
import { SimulatedPushProvider } from './push/simulated-push-provider.js';
import type { NotificationMessage, NotificationSender, SendResult } from './sender-types.js';

export { DeliverySkipped, type NotificationMessage, type NotificationSender, type SendResult } from './sender-types.js';

/**
 * Local email simulator: "delivers" by writing a log line. Together with the NotificationDelivery
 * rows (status SIMULATED) this is the notification log. Never used in production (config refuses it).
 * TODO(notifications): email provider TBD.
 */
export class SimulatedSender implements NotificationSender {
  private readonly logger = new Logger('NotificationSimulator');
  /** Messages "sent" by this instance (handy in tests). */
  readonly sent: NotificationMessage[] = [];

  async send(message: NotificationMessage): Promise<SendResult> {
    this.sent.push(message);
    this.logger.log(`[simulated ${message.channel.toLowerCase()}] to ${message.recipient.email}: ${message.title}${message.body ? ` - ${message.body}` : ''}`);
    return { provider: 'simulator', simulated: true };
  }
}

export type NotificationSenders = Partial<Record<'PUSH' | 'EMAIL', NotificationSender>>;

export interface SenderConfig {
  nodeEnv: string;
  /** Email (and anything without its own provider). */
  delivery: 'simulator' | 'disabled';
  push: { provider: 'expo' | 'simulator' | 'none'; expoAccessToken: string | null };
}

/**
 * Wires the senders from config:
 * - PUSH: per device provider - `expo` tokens go to the Expo push service when PUSH_PROVIDER=expo
 *   (else the simulator); `dev_simulated` tokens are always simulated, and never outside
 *   development. PUSH_PROVIDER=none -> no push sender (deliveries SKIPPED not_configured).
 * - EMAIL: simulator or nothing.
 */
export function createNotificationSenders(prisma: PrismaClient, config: SenderConfig): NotificationSenders {
  const senders: NotificationSenders = {};
  if (config.delivery === 'simulator') senders.EMAIL = new SimulatedSender();
  if (config.push.provider !== 'none') {
    const simulator = new SimulatedPushProvider();
    const providers: Record<string, PushProvider> = {
      expo: config.push.provider === 'expo' ? new ExpoPushProvider({ accessToken: config.push.expoAccessToken ?? undefined }) : simulator,
    };
    if (config.nodeEnv !== 'production') providers.dev_simulated = simulator;
    senders.PUSH = new PushNotificationSender(prisma, providers);
  }
  return senders;
}
