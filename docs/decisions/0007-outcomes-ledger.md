# 0007 - Outcomes ledger: realized P/L only from sales

Status: accepted (step 31, Build Prompt 28). Date: 2026-10-08.

## Context

Rein Drop shows estimates about deals (scoring, decision 0005) and must also show what the seller
actually made. The App Flow Blueprint (section 11) says realized results and missed potential
must never be mixed.

## Decision

- **Bought** creates one InventoryItem per deal (linked by `huntMatchId`) with the price paid,
  optional purchase costs, and a frozen **expected snapshot**: asking price, listing-stated costs,
  and an ESTIMATED resale / upside only when comparable sales produced one. The snapshot is never
  edited, so expected vs actual survives corrections.
- **Holding** (In stock / Listed) has no profit and no loss.
- **Mark Sold** records the sale price, date, marketplace and selling costs. Realized profit =
  sale price - selling costs - (purchase price + purchase costs), in integer minor units, from one
  shared function (`realizedResult` in contracts), used by the inventory API and Home.
- Purchase costs (tax, shipping to you, repair, supplies, other) belong to the item; selling costs
  (marketplace fee, payment fee, shipping to the buyer, other) belong to the sale.
- **Missed potential is never a loss:** a deal never bought never enters the ledger, and the gap
  between an estimate and the actual result is shown as a comparison, not as profit or loss.
- Currencies are never mixed or converted: costs must match their price's currency; a sale in
  another currency is stored but has no realized result until FX exists.
- Margin % = profit / sale price; return % = profit / cost basis; whole percent toward zero.

## Open

- Returns, write-offs, undoing a Bought entirely, FX - later prompts (see OUTSTANDING).
- Estimated upside doesn't subtract selling fees yet (decision 0005), so the profit comparison
  is estimate-without-fees vs actual-with-fees.
