# 0019 - Sell workspace: list bought items, AI drafts, cross-listing

Status: accepted (step 83, 2026-10-15) - owner decisions in the step 83 conversation

## Context

Rein Drop helped resellers find and buy deals and track inventory, but listing a bought item for
sale happened entirely outside it ("I've listed it" was only a status flag). The owner asked for a
listing feature: on a bought product, click "List" and get a page where the listing can be
written by hand or with "Use AI", always editable, then cross-listed on chosen marketplaces.
Sell was modelled as a product family (step 79) but not built (backlog B-04).

## Decision (owner choices)

- **Full flow, mock publishing.** List → write (manual or AI draft) → photos → pick marketplaces →
  publish, through one **publisher per marketplace**:
  - **eBay: mock** (`TODO(sell)`): nothing is posted. Real listing needs eBay developer keys with
    the Sell APIs and each seller connecting their eBay account (OAuth, Inventory API).
  - **Facebook Marketplace: assisted.** Facebook has no public API for creating Marketplace
    listings, so Rein Drop prepares ready-to-paste text and opens Facebook's "create listing" page.
    The seller then confirms it's posted (optionally with its link).
- **Open to everyone, any marketplace.** During beta every account can list on every supported
  marketplace, with no plan gate. `@RequiresProduct('sell')` stays available for when Sell is priced.
  Plan limits (e.g. listings per month) can be added later without rebuilding.
- **Web and mobile.** "List for sale" on any held inventory item on both. Mobile takes photos with the
  camera or picks from the library (`expo-image-picker`). The web uploads files.
- **Photos: full freedom.** The seller's own photos, the source listing's photos, or a mix. Any
  photo can be the cover (position 0). The UI notes that source photos belong to the original
  seller and some marketplaces reject reused photos. It never blocks them.
- **AI drafts are suggestions.** `POST /sell/listings/:id/draft` returns a suggestion that is **not
  saved**. The client fills the form, asking before replacing anything the seller wrote, and the
  seller edits and saves.
  - Validated like every AI task (`withValidation`): item details must be grounded in the item's
    text; no guarantees; no "brand new" unless the item is new; no warranty the facts don't mention.
  - It **never reveals the purchase price or where the item was bought** (checked).
  - A price is suggested only from the resale estimate frozen at purchase, as an estimate, never
    invented.
  - Providers: mock (development), Foundry (`FOUNDRY_DEPLOYMENT_LISTING_DRAFT`). Production without
    `AI_PROVIDER`: "Use AI" is unavailable. The AI reads text only; photos are a TODO(sell).

## Model

- `SellListing`: one per inventory item, with title, description, price, condition, item details and
  `aiAssisted`.
- `SellPhoto`: own (media storage key) or source (URL), ordered by position.
- `SellChannel`: one per marketplace, with status PUBLISHED / AWAITING_CONFIRMATION / FAILED / ENDED,
  the provider, and the external id and URL.
- Migration `20261014225309_sell_workspace`, additive only.
- A live channel moves the inventory item to **Listed**. Ending every channel moves it back to
  **In stock**. Sold items can't be listed.

## Photos and storage

- **Storage:** `MEDIA_STORAGE=local` in development (`MEDIA_DIR`, ignored by git) and `none` by
  default in production (uploads off, source photos still work). Azure Blob storage is TODO(media):
  the owner provisions the storage account.
- **Signed links:** own photos are served by `GET /media/:key` with a short-lived HMAC-signed link
  (`MEDIA_SIGNING_SECRET`, 1 hour). Mobile resolves it against its API URL; the web passes it
  through `apps/web/src/app/media/[key]/route.ts`.
- **Uploads:** JPEG / PNG / WebP / HEIC, up to 8 MB each, 12 photos per listing.

## Consequences

- **Capabilities:** `sell.workspace` and `inventory.photos` are now **live on web and mobile** (they
  were unbuilt). The web gains a **Sell** destination (sidebar; top bar on narrow screens). The
  mobile Inventory tab gets a "Your listings" header button.
- **Mobile guard test:** it now also allows opening the seller's own marketplace pages (a listing
  link and Facebook's create page). Rein Drop and payment links stay banned.
- **Open items (OUTSTANDING):**
  - real eBay publishing (keys + OAuth);
  - Azure Blob photo storage;
  - AI vision on photos;
  - updating already-published listings when edited;
  - per-plan limits when Sell is priced;
  - product events for listing.
