import { Logger } from '@nestjs/common';
import type { PushMessage, PushProvider, PushTicket } from './push-provider.js';

/**
 * Local push simulator: accepts every message and logs it (`[simulated push] -> …<last 6 of token>: ...`).
 * Tokens are masked in logs - a push token is enough to send to that phone.
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
      this.logger.log(`[simulated push] -> ${maskToken(m.to)}: ${m.title}${m.body ? ` - ${m.body}` : ''}`);
      return { status: 'ok', id: null };
    });
  }
}

/** "ExponentPushToken[abc...xyz]" -> "…xyz]": enough to tell devices apart in a log, useless to send with. */
export function maskToken(token: string): string {
  return token.length <= 6 ? '…' : `…${token.slice(-6)}`;
}
