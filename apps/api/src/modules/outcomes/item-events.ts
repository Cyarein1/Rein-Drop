import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  CLIENT_PLATFORM_HEADER,
  inventoryEventDetailsSchema,
  type EventSource,
  type InventoryEvent,
  type InventoryEventDetails,
  type InventoryEventType,
} from '@rein-drop/contracts';
import type { Prisma } from '@rein-drop/db';
import type { Request } from 'express';

/**
 * The item event history (audit trail, decision 0021): one append-only row per change to an
 * inventory item. Every mutation in Outcomes, Deals (bought) and Sell writes one, inside the same
 * transaction as the change, so the history can't miss or invent a change.
 */

type Db = Prisma.TransactionClient;

export interface ItemEventInput {
  itemId: string;
  userId: string;
  type: InventoryEventType;
  source: EventSource | null;
  details?: InventoryEventDetails;
  at?: Date;
}

let lastStamp = 0;
/**
 * "Now" for an event, strictly increasing within this process, so several events written in one
 * change (channel ended -> sold) keep their order on the timeline even within one millisecond.
 * (The database default would be the transaction's start time - the same for all of them.)
 */
function stamp(): Date {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp);
}

export async function writeItemEvent(db: Db, e: ItemEventInput): Promise<void> {
  await db.inventoryEvent.create({
    data: {
      inventoryItemId: e.itemId,
      userId: e.userId,
      type: e.type,
      source: e.source,
      details: e.details && Object.keys(e.details).length > 0 ? (e.details as Prisma.InputJsonValue) : undefined,
      at: e.at ?? stamp(),
    },
  });
}

export async function writeItemEvents(db: Db, events: readonly ItemEventInput[]): Promise<void> {
  for (const e of events) await writeItemEvent(db, e);
}

export function toInventoryEvent(row: { id: string; type: InventoryEventType; at: Date; source: string | null; details: unknown }): InventoryEvent {
  const details = inventoryEventDetailsSchema.safeParse(row.details ?? {});
  return {
    id: row.id,
    type: row.type,
    at: row.at.toISOString(),
    source: row.source === 'web' || row.source === 'mobile' || row.source === 'system' ? row.source : null,
    details: details.success ? details.data : {},
  };
}

/** Where the request came from (x-client-platform: web | mobile); null when the client didn't say. */
export function clientSource(req: Pick<Request, 'headers'>): EventSource | null {
  const raw = req.headers[CLIENT_PLATFORM_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return value === 'web' || value === 'mobile' ? value : null;
}

/** `@Source() source` - the event source of the current request. */
export const Source = createParamDecorator((_data: unknown, ctx: ExecutionContext): EventSource | null => clientSource(ctx.switchToHttp().getRequest<Request>()));
