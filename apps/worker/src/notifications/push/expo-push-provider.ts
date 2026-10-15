import type { PushErrorCode, PushMessage, PushProvider, PushReceipt, PushTicket } from './push-provider.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 1000 receipt ids per request. */
const MAX_RECEIPT_BATCH = 1000;
/** Expo accepts at most 100 messages per request. */
const MAX_BATCH = 100;

const EXPO_ERRORS: Record<string, { code: PushErrorCode; retryable: boolean }> = {
  DeviceNotRegistered: { code: 'device_not_registered', retryable: false },
  MessageTooBig: { code: 'message_too_big', retryable: false },
  MessageRateExceeded: { code: 'rate_limited', retryable: true },
  InvalidCredentials: { code: 'invalid_credentials', retryable: false },
  MismatchSenderId: { code: 'invalid_credentials', retryable: false },
};

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/). Works for
 * Expo push tokens from development and store builds. The access token is optional (only needed
 * when "enhanced push security" is turned on for the Expo project).
 *
 * Receipts (`/getReceipts`) are fetched ~15 minutes later by PushMaintenance - delivery errors such
 * as DeviceNotRegistered often only surface there, not in the ticket.
 */
export class ExpoPushProvider implements PushProvider {
  readonly id = 'expo';
  readonly simulated = false;

  constructor(
    private readonly options: { accessToken?: string; fetch?: typeof fetch; timeoutMs?: number } = {},
  ) {}

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (let i = 0; i < messages.length; i += MAX_BATCH) tickets.push(...(await this.sendBatch(messages.slice(i, i + MAX_BATCH))));
    return tickets;
  }

  async getReceipts(ticketIds: readonly string[]): Promise<Map<string, PushReceipt>> {
    const receipts = new Map<string, PushReceipt>();
    const doFetch = this.options.fetch ?? globalThis.fetch;
    for (let i = 0; i < ticketIds.length; i += MAX_RECEIPT_BATCH) {
      const ids = ticketIds.slice(i, i + MAX_RECEIPT_BATCH);
      const response = await doFetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}) },
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
      // An outage just means "not yet": the maintenance loop asks again later.
      if (!response.ok) throw new Error(`Expo receipts HTTP ${response.status}`);
      const payload = (await response.json()) as { data?: Record<string, ExpoTicket> };
      for (const [id, r] of Object.entries(payload.data ?? {})) {
        if (r.status === 'ok') receipts.set(id, { status: 'ok' });
        else receipts.set(id, { status: 'error', code: (EXPO_ERRORS[r.details?.error ?? ''] ?? { code: 'other' as const }).code, message: r.message ?? r.details?.error ?? 'Expo push error' });
      }
    }
    return receipts;
  }

  private async sendBatch(batch: readonly PushMessage[]): Promise<PushTicket[]> {
    const all = (code: PushErrorCode, message: string, retryable: boolean): PushTicket[] => batch.map(() => ({ status: 'error', code, message, retryable }));
    const doFetch = this.options.fetch ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(this.options.accessToken ? { authorization: `Bearer ${this.options.accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((m) => ({ to: m.to, title: m.title, body: m.body ?? undefined, data: m.data, sound: 'default', priority: 'high', channelId: m.channelId }))),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (err) {
      return all('unavailable', `Expo push unreachable: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    if (response.status === 429) return all('rate_limited', 'Expo push rate limit', true);
    if (response.status === 401 || response.status === 403) return all('invalid_credentials', `Expo push rejected the request (${response.status})`, false);
    if (!response.ok) return all('unavailable', `Expo push HTTP ${response.status}`, response.status >= 500);

    let payload: { data?: ExpoTicket[]; errors?: { message?: string }[] };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      return all('unavailable', 'Expo push returned an unreadable response', true);
    }
    if (!Array.isArray(payload.data) || payload.data.length !== batch.length) {
      return all('other', `Expo push request failed: ${payload.errors?.map((e) => e.message).join('; ') ?? 'unexpected response'}`, false);
    }
    return payload.data.map((t): PushTicket => {
      if (t.status === 'ok') return { status: 'ok', id: t.id ?? null };
      const mapped = EXPO_ERRORS[t.details?.error ?? ''] ?? { code: 'other' as const, retryable: false };
      return { status: 'error', code: mapped.code, message: t.message ?? t.details?.error ?? 'Expo push error', retryable: mapped.retryable };
    });
  }
}
