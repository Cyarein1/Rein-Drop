import { Logger } from '@nestjs/common';
import type { PushMessage, PushProvider, PushTicket } from './push-provider.js';

/**
 * Local push simulator: accepts every message and logs it (`[simulated push] -> <token>: ...`).
 * Used for all devices in development by default, and always for `dev_simulated` devices
 * (Expo Go can't receive push). Never used in production.
 */
export class SimulatedPushProvider implements PushProvider {
  readonly id = 'simulator';
  readonly simulated = true;
  private readonly logger = new Logger('PushSimulator');
  /** Messages "sent" by this instance (handy in tests). */
  readonly sent: PushMessage[] = [];

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    return messages.map((m) => {
      this.sent.push(m);
      this.logger.log(`[simulated push] -> ${m.to}: ${m.title}${m.body ? ` - ${m.body}` : ''}`);
      return { status: 'ok', id: null };
    });
  }
}
