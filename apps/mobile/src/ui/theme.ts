import { roles } from '@rein-drop/design-tokens';

/**
 * Phone type scale (step 89 redesign, owner-approved mock-up): native-app sizes, smaller than the
 * web's `fontSize` scale - hierarchy comes from weight and colour more than size. Mobile only; the
 * web keeps `@rein-drop/design-tokens` fontSize.
 */
export const type = {
  /** Tab screens' own large title. */
  largeTitle: 30,
  /** Detail screen headings, sheet titles, Create Hunt questions use `question`. */
  title: 20,
  question: 26,
  /** Prices on rows and key figures. */
  price: 18,
  /** Row titles, section headings, buttons. */
  headline: 16,
  /** Body text and row titles. */
  body: 15,
  /** Secondary lines, chip labels. */
  callout: 14,
  /** Meta lines, section labels. */
  subhead: 13,
  footnote: 12,
  caption: 11,
} as const;

/** Mobile colours beyond the shared roles. */
export const colors = {
  ...roles,
  /** Grouped-list background (Account, forms): navy 4%. */
  grouped: '#F6F6F7',
  /** Hairline separators between rows. */
  separator: roles.border,
  /**
   * Profit green for TEXT: brand Profit Green (#16A66A) is 3.2:1 on white - too light for small
   * text, so text uses this darker shade (5.4:1, AA). Fills and accents keep the brand green.
   */
  profitText: '#0E7A4D',
  /** Loss red for text on white (AA). */
  lossText: '#B42D2D',
  /** Warning icon / text (AA on white). */
  warningText: '#B4561E',
  /** Scrim behind sheets and the photo-header buttons' shadow colour. */
  scrim: 'rgba(18,35,63,0.45)',
} as const;

/** Horizontal screen gutter - every edge (titles, rows, header buttons) keeps at least this from the screen edge. */
export const GUTTER = 16;
