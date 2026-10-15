# 0020 - Native, list-first mobile design

- **Status:** accepted (owner, 2026-10-16)
- **Step:** 89

## Context

The owner found that the mobile companion "looks like a web application shrunk into mobile". Text
and buttons looked big, and the layout felt like a desktop app.

The causes were all in the code:
- **Web-sized type:** body 16, titles 18-22.
- **Big buttons everywhere:** full 48 pt bordered buttons, including quick actions on each deal card.
- **Cramped width:** the screen padding plus card padding left about 320 pt for content.
- **Web-page layouts:** paragraph intros, labelled radio groups as filters, inline forms and
  underlined text links.
- **Wrong containers:** settings shown as cards of text, and lists built as ScrollViews.
- **No product photos** on deals.

Two other details also annoyed the owner: the header icons sat almost on the screen edge, and a
scrollbar showed under the side-scrolling rows.

## Decision

The owner approved a mock-up that follows the **eBay app's patterns** in Rein Drop's own brand:
navy, orange, Inter and the mascot rules. Nothing of eBay's branding is used.

- A **phone type scale for mobile only** (`apps/mobile/src/ui/theme.ts`): large title 30, title
  20, body 15, secondary 13, caption 11. The web keeps its own scale.
- **Rows that run edge to edge:**
  - deals with a product photo, price and estimated upside;
  - Hunts, inventory and listings in the same style;
  - **swipe** to save or dismiss a deal, also offered to screen readers as actions.
- **Filter chips** that scroll sideways by dragging, with no scrollbar.
- **Large-title headers** that tab screens draw themselves. Header buttons keep a 16 pt gutter
  from the screen edge.
- **Detail screens** with a photo header and a **fixed bottom action bar**.
- **Native bottom sheets** (`presentation: 'formSheet'`) for the "I bought it", "Not for me" and
  "Mark sold" forms.
- **One question per screen** for Create / Edit Hunt and onboarding, with a progress bar.
- **Grouped settings rows** for Account, opening sub-screens.
- **Native touches:** placeholder rows while loading, haptics, pill buttons and compact badges.
- **Same design on iOS and Android**, with platform icons (SF Symbols / Material Symbols).

New dependencies, installed with `npx expo install`; all are included in Expo Go:
- `react-native-gesture-handler` (swipe rows);
- `react-native-reanimated` and `react-native-worklets` (swipe and skeleton animation);
- `expo-image` (cached product photos);
- `expo-haptics`.

## Consequences

- Behaviour, data, API calls, accessibility and the billing-free companion rules are unchanged.
  The guard test still passes.
- Product photos come from the source listing (`listing.imageUrl` / `imageUrls`), so they need
  more network traffic than text-only cards.
- Green text uses a darker shade (#0E7A4D, 5.4:1) because Profit Green (#16A66A) is too light
  for small text. Brand green stays for fills.
- What can't be checked automatically: how it looks and feels on real phones, including swipe,
  sheets, haptics and German text lengths. This is a device checklist item.
