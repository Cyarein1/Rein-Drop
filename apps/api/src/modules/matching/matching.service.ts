import { Injectable } from '@nestjs/common';
import type { Prisma } from '@rein-drop/db';

type Tx = Prisma.TransactionClient;

/**
 * The user's decisions on a HuntMatch. Matching itself (NEW / EXPIRED) is done by the worker
 * with @rein-drop/matching; these are the only status changes users make. Every write is a
 * conditional update, so it can't overwrite a decision made concurrently (or by the worker).
 * Each returns whether the row changed.
 */
@Injectable()
export class MatchingService {
  /** NEW -> SEEN (first open). */
  async markSeen(tx: Tx, matchId: string, at: Date): Promise<boolean> {
    const { count } = await tx.huntMatch.updateMany({ where: { id: matchId, status: 'NEW' }, data: { status: 'SEEN', seenAt: at } });
    return count === 1;
  }

  /** "Ignore" -> DISMISSED with an optional reason. Never for a bought deal. */
  async ignore(tx: Tx, matchId: string, reason: string | null, at: Date): Promise<boolean> {
    const { count } = await tx.huntMatch.updateMany({
      where: { id: matchId, status: { not: 'BOUGHT' } },
      data: { status: 'DISMISSED', dismissedAt: at, dismissReason: reason },
    });
    return count === 1;
  }

  /** Undo Ignore -> SEEN (the next search re-checks availability). */
  async unignore(tx: Tx, matchId: string): Promise<boolean> {
    const { count } = await tx.huntMatch.updateMany({
      where: { id: matchId, status: 'DISMISSED' },
      data: { status: 'SEEN', dismissedAt: null, dismissReason: null },
    });
    return count === 1;
  }

  /** -> BOUGHT. False when it already was (so the purchase is recorded once). */
  async markBought(tx: Tx, matchId: string, at: Date): Promise<boolean> {
    const { count } = await tx.huntMatch.updateMany({
      where: { id: matchId, status: { not: 'BOUGHT' } },
      data: { status: 'BOUGHT', boughtAt: at, dismissedAt: null, dismissReason: null },
    });
    return count === 1;
  }
}
