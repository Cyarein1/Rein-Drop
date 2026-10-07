import { deliveryPlan, type NotificationCategory, type NotificationChannel } from '@rein-drop/contracts';
import type { Prisma } from '@rein-drop/db';

type Tx = Prisma.TransactionClient;

export interface DealAlertInput {
  userId: string;
  huntId: string;
  huntMatchId: string;
  dealAnalysisId: string;
  kind: 'deal' | 'exceptional';
  title: string;
  body: string | null;
  now: Date;
}

/** At most one alert per deal, ever - re-analysis, retries and later searches never alert again. */
export const dealAlertKey = (huntMatchId: string) => `deal:${huntMatchId}`;

/**
 * Writes the alert for an eligible deal and its per-channel deliveries, inside the caller's
 * transaction (the one that stores the DealAnalysis), so an alert exists exactly when its
 * analysis does. Returns null when this deal already had its alert.
 *
 * - IN_APP is delivered by writing the alert itself (the inbox reads Alert rows): SENT now.
 * - Channels the user turned off are recorded as SKIPPED (disabled_by_preference).
 * - Other channels are PENDING: the NotificationDispatcher (outbox) sends them. `lockedUntil`
 *   doubles as "not before" - they're claimable from `now`.
 */
export async function writeDealAlert(tx: Tx, input: DealAlertInput): Promise<{ alertId: string } | null> {
  const category: NotificationCategory = input.kind === 'exceptional' ? 'exceptional_deals' : 'deal_alerts';
  const dedupeKey = dealAlertKey(input.huntMatchId);
  // ON CONFLICT DO NOTHING: a duplicate never aborts the surrounding transaction.
  const { count } = await tx.alert.createMany({
    data: [
      {
        userId: input.userId,
        category,
        huntId: input.huntId,
        huntMatchId: input.huntMatchId,
        dealAnalysisId: input.dealAnalysisId,
        dedupeKey,
        title: input.title.slice(0, 160),
        body: input.body?.slice(0, 600) ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return null;

  const alert = await tx.alert.findUniqueOrThrow({ where: { dedupeKey }, select: { id: true } });
  const stored = await tx.notificationPreference.findMany({ where: { userId: input.userId }, select: { category: true, channel: true, enabled: true } });
  const deliveries = deliveryPlan(category, stored).map((item) => {
    const base = { alertId: alert.id, channel: item.channel as NotificationChannel };
    if (item.channel === 'IN_APP') return { ...base, status: 'SENT' as const, provider: 'in_app', sentAt: input.now };
    if (!item.deliver) return { ...base, status: 'SKIPPED' as const, reason: item.reason };
    return { ...base, status: 'PENDING' as const, lockedUntil: input.now };
  });
  await tx.notificationDelivery.createMany({ data: deliveries, skipDuplicates: true });
  return { alertId: alert.id };
}
