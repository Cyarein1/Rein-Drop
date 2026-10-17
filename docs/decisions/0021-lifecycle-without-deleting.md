# 0021 - Item lifecycle without deleting; Inventory, Sell and Analytics roles

- **Status:** accepted (owner, 2026-10-17)
- **Steps:** 90 (lifecycle) and 91 (structure)

## Context

The owner noticed that parts of the create / read / update / delete lifecycle were missing. An
audit of every API action confirmed the gaps:
- "I bought it" can't be undone.
- Inventory items can only come from a deal (no manual add) and can't be removed.
- Draft listings can't be discarded.
- Accounts can't be deleted (release blocker RB1).

It also found a data risk: marking an item sold left its marketplace listings published, so a
second buyer could pay for an item the seller no longer has.

The owner also found Inventory, Sell and Analytics confusing. One item's story was spread across
three areas, and Analytics mixed "am I buying well?" with "am I selling well?".

## Decision

1. **Nothing is hard-deleted.** Hunts, deals, purchases, sales and listings are linked, and they
   form the audit trail: what was bought, from where, sold where, for how much. Mistakes and
   endings are statuses:
   - item: Cancelled (bought by mistake / undo bought), Returned, Written off;
   - Hunt: Archived;
   - listing: Discarded (restorable) or Ended.
   Every change to an item is recorded as an item event.
2. **Account deletion is the one real erase**, required by Apple 5.1.1(v), Google Play and GDPR.
   Deleting an account erases or anonymises that person's data.
3. **Manual "Add item"** covers things bought outside Rein Drop.
4. **A sale ends the listings.** Recording a sale ends every other marketplace listing, whether
   it's recorded from the listing ("Sold on …") or from Inventory ("Mark sold").
5. **Roles (step 91).** The owner decided on 2026-10-17 to merge Inventory into Sell.
   - **Sell** is one area: one tab on mobile (Deals · Hunts · + · Sell · Account) and one
     navigation entry on the web. Its sections:
     - **Holding:** in stock, not listed.
     - **Listings:** Drafts and Active.
     - **Sold.**
     - **Other:** Returned, Written off, Cancelled.
     - **Insights:** profit and time to sell per product and marketplace, fees, slow sellers and
       money tied up in stock.

     "Add item" sits at the top.
   - **One item page** for every item: its whole story as a timeline (bought → listed → sold,
     returned or written off), with costs, profit and the actions allowed in its current state.
   - **Analytics:** numbers and charts only. Every figure links to the detail: a missed-potential
     bar opens those deals, and a product's profit opens its sold items. Details live in the
     areas above or in a pop-up, never as long lists in Analytics.

## Consequences

- New migration: item status Cancelled, listing status Discarded, and an item event table.
- How Cancelled, Returned and Written off count in profit figures is defined in the outcomes
  ledger and documented.
- The web German work moves to step 92, and push / landing page / store German to step 93.

## Implementation - step 90 (backend)

Migration `20261017220638_item_lifecycle`: `InventoryStatus.CANCELLED`, `SellListingStatus.DISCARDED`,
`InventoryEvent` (+ `InventoryEventType`), item columns `boughtFromMarketplace`, `boughtFromText`,
`closedAt`, `closedNote`, `refundMinor`, channel columns `endedReason`, `endedAt`, `removalPending`.
It backfills BOUGHT / ADDED_MANUALLY, LISTING_STARTED, PUBLISHED, CHANNEL_ENDED and SOLD events from
the stored timestamps (`source: "system"`, `details.backfilled: true`).

### Item state machine (`INVENTORY_TRANSITIONS` in contracts `inventory-lifecycle.ts`)

| From | Allowed actions -> status |
|---|---|
| IN_STOCK | edit_purchase, mark_listed -> LISTED, list_for_sale, mark_sold -> SOLD, return -> RETURNED, write_off -> WRITTEN_OFF, cancel -> CANCELLED |
| LISTED | edit_purchase, mark_unlisted -> IN_STOCK, list_for_sale, mark_sold, return, write_off, cancel |
| SOLD | edit_purchase, correct_sale, undo_sale -> IN_STOCK |
| RETURNED / WRITTEN_OFF | edit_purchase, reopen -> IN_STOCK |
| CANCELLED | reopen -> IN_STOCK |

- `cancel` (Undo bought) and `mark_unlisted` are refused while a marketplace listing is live or
  awaiting confirmation (409, "take the listing down in Sell first").
- Cancelling a deal's item sets the deal back from BOUGHT to SEEN (not bought); `reopen` (or
  marking the deal Bought again, which revives the same item with the new price) makes it BOUGHT
  again. A draft listing is discarded with the cancel.
- A sale, return or write-off ends every live channel and the listing in the same transaction.
  Assisted channels (Facebook) are marked ENDED with `removalPending` until the seller confirms.
  Undo sale keeps them ended. Every item response carries `actions` (what is allowed now).

### How each status counts

| Status | Bought / spent | Holding | Realized |
|---|---|---|---|
| IN_STOCK / LISTED | yes | yes | none (neither profit nor loss) |
| SOLD | yes | no | sale - selling costs - purchase - purchase costs (`realized`) |
| RETURNED | yes | no | refund - (purchase + purchase costs), dated `closedAt` (`closed`) |
| WRITTEN_OFF | yes | no | -(purchase + purchase costs), dated `closedAt` (`closed`) |
| CANCELLED | no | no | none - left out of every figure (analytics, Home, funnels) |

Analytics overview keeps `realized` = sales only and adds `closed` (per currency) and
`netRealized` (sales + closed). Products add `returned`, `writtenOff`, `closedResult`. Hunt and
marketplace analytics and Home's realized profit stay sales-only (cancelled purchases excluded).
The refund defaults to the purchase price (purchase costs not refunded).

### Account deletion (`POST /me/delete`, `{ "confirmation": "DELETE" }`)

1. Stripe (web billing): every open subscription is cancelled immediately (no further charges, no
   refund or proration) and the Stripe customer is deleted. Stripe keeps invoices / payments. If
   Stripe fails: 503 and nothing is deleted.
2. The User row is deleted; everything personal cascades. Kept (no personal data): shared
   marketplace Listings and their analyses, BillingEvent rows (provider ids only), search runs and
   jobs (internal ids). Own listing photos are removed from media storage.
3. Suspended accounts get 403 ACCOUNT_SUSPENDED (support handles them).
4. The caller must sign out: with dev auth the next call is 401; with Entra a new, empty account
   would be created on the next signed-in call.

Open questions for the owner:
- TODO(owner): the Entra External ID user is not deleted (needs Microsoft Graph with
  `User.ReadWrite.All` application permission, or a manual step in the Entra admin centre).
- Should suspended (fraud / chargeback) accounts be deletable by the user? Chosen: no, support.
- Deleting the Stripe customer was chosen (GDPR-conservative); confirm with the accountant that
  Stripe's own invoice records are enough.
- Product telemetry keeps the opaque user id (no personal data); its retention is D38.
- Should Home's 30-day realized profit include returns / write-offs (now sales-only)?
