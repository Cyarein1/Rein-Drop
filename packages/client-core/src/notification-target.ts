/**
 * Where a tapped push notification opens (mobile companion). Push payloads carry only opaque ids -
 * never tokens, credentials or account data - and are treated as untrusted input: anything that
 * isn't a well-formed id opens the inbox instead of being passed to navigation.
 */
export type NotificationTarget =
  | { kind: 'deal'; dealId: string; alertId: string | null }
  | { kind: 'inbox'; alertId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): string | null => (typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null);

export function notificationTarget(data: unknown): NotificationTarget {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const alertId = id(record.alertId);
  const dealId = id(record.dealId);
  return dealId ? { kind: 'deal', dealId, alertId } : { kind: 'inbox', alertId };
}

/**
 * A tap is handled once: the same notification (by its identifier) never opens twice - e.g. the
 * cold-start response and the listener firing for the same tap, or a relaunch replaying it.
 */
export function createTapDeduper(limit = 50): (notificationId: string) => boolean {
  const seen: string[] = [];
  return (notificationId) => {
    if (seen.includes(notificationId)) return false;
    seen.push(notificationId);
    if (seen.length > limit) seen.shift();
    return true;
  };
}

/**
 * A tap that arrives before the session is ready (app launching, session expired, signed out) is
 * kept and opened right after sign-in - only for the same account that was signed in when it was
 * stored, or for the first account to sign in when none was.
 */
export interface PendingTap {
  target: NotificationTarget;
  /** The signed-in account when the tap arrived, if any. */
  forUserId: string | null;
}

export function takePendingTap(pending: PendingTap | null, signedInUserId: string | null): { open: NotificationTarget | null; keep: PendingTap | null } {
  if (!pending) return { open: null, keep: null };
  if (!signedInUserId) return { open: null, keep: pending };
  if (pending.forUserId && pending.forUserId !== signedInUserId) return { open: null, keep: null };
  return { open: pending.target, keep: null };
}
