import { Injectable } from '@nestjs/common';
import type { Money } from '@rein-drop/contracts';
import type { Prisma } from '@rein-drop/db';

type Tx = Prisma.TransactionClient;

export interface DealPurchase {
  userId: string;
  huntMatchId: string;
  listingId: string;
  title: string;
  /** What the user actually paid (defaults to the asking price upstream). */
  price: Money;
  purchasedAt: Date;
}

/**
 * The reselling ledger. For now only the purchase that "Bought" on a deal creates.
 * TODO(outcomes): purchase costs, holding state, Mark Sold and realized P/L - Build Prompt 28.
 */
@Injectable()
export class OutcomesService {
  /** One InventoryItem per deal (unique huntMatchId). Returns its id. */
  async recordDealPurchase(tx: Tx, purchase: DealPurchase): Promise<string> {
    const item = await tx.inventoryItem.upsert({
      where: { huntMatchId: purchase.huntMatchId },
      create: {
        userId: purchase.userId,
        huntMatchId: purchase.huntMatchId,
        listingId: purchase.listingId,
        title: purchase.title,
        purchasePriceMinor: purchase.price.amountMinor,
        currency: purchase.price.currency,
        purchasedAt: purchase.purchasedAt,
      },
      update: {},
      select: { id: true },
    });
    return item.id;
  }
}
