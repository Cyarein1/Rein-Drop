import { StyleSheet, Text, View } from 'react-native';
import { estimateNote, type DealDetailView, type UpsideView } from '@rein-drop/client-core';
import { radius, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { colors, font, type } from '@/ui';

type EconomicsView = Pick<DealDetailView, 'price' | 'priceExtra' | 'priceLines' | 'maxPriceNote' | 'resale' | 'upside' | 'targetNote' | 'notIncluded'>;

/**
 * The deal's economics for a quick decision (step 89 mock-up): a three-column strip - asking
 * price (fact), resale and upside (always labelled estimates) - then the note that estimates are
 * never guaranteed profit, the ranges behind them and the known-cost breakdown. All figures come
 * from the shared view model - nothing is calculated here.
 */
export function DealEconomics({ view }: { view: EconomicsView }) {
  const t = useT();
  const breakdown = view.priceLines.length > 1;
  return (
    <View style={styles.wrap}>
      <View style={styles.strip}>
        <Column label={t('deals.stripPrice')} spoken={t('deals.askingPrice')} value={view.price} caption={view.priceExtra} />
        <EstimateColumn label={t('deals.stripResale')} spoken={t('deals.resaleValue')} est={view.resale} />
        <EstimateColumn label={t('deals.stripUpside')} spoken={t('deals.potentialUpside')} est={view.upside} profit />
      </View>
      <Text style={[styles.note, font('regular')]}>{estimateNote(t)}</Text>

      {(view.resale.caption || view.upside.caption) && (
        <View style={styles.lines}>
          {view.resale.caption ? <Line text={t('deals.checkLine', { label: t('deals.resaleValue'), detail: view.resale.caption })} /> : null}
          {view.upside.caption ? <Line text={t('deals.checkLine', { label: t('deals.potentialUpside'), detail: view.upside.caption })} /> : null}
        </View>
      )}

      {breakdown && (
        <View style={styles.breakdown}>
          {view.priceLines.map(([label, value], i) => (
            <View key={label} style={[styles.row, i > 0 && styles.rowBorder]} accessible accessibilityLabel={t('common.metricA11y', { label, value })}>
              <Text style={[styles.rowLabel, font('regular')]}>{label}</Text>
              <Text style={[styles.rowValue, font('semibold')]}>{value}</Text>
            </View>
          ))}
        </View>
      )}
      {view.maxPriceNote && <Line text={view.maxPriceNote} strong />}
      {view.targetNote && <Line text={view.targetNote} />}
      {view.notIncluded && <Line text={view.notIncluded} />}
    </View>
  );
}

function Column({ label, spoken, value, caption }: { label: string; spoken: string; value: string; caption?: string | null }) {
  const t = useT();
  return (
    <View style={styles.col} accessible accessibilityLabel={[t('common.metricA11y', { label: spoken, value }), caption].filter(Boolean).join('. ')}>
      <Text style={[styles.label, font('regular')]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.value, font('bold')]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      {caption ? (
        <Text style={[styles.caption, font('regular')]} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** An estimate column: the figure is marked "Estimated" (visibly and when spoken); no figure is invented. */
function EstimateColumn({ label, spoken, est, profit = false }: { label: string; spoken: string; est: UpsideView; profit?: boolean }) {
  const t = useT();
  return (
    <View
      style={[styles.col, styles.colBorder]}
      accessible
      accessibilityLabel={est.estimated ? t('common.metricA11yEstimated', { label: spoken, value: est.value }) : t('common.metricA11y', { label: spoken, value: est.value })}
    >
      <Text style={[styles.label, font('regular')]} numberOfLines={2}>
        {label}
      </Text>
      {est.estimated ? (
        <>
          <Text style={[styles.value, font('bold'), profit && styles.profit]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {est.value}
          </Text>
          <Text style={[styles.caption, font('medium')]}>{t('common.estimated')}</Text>
        </>
      ) : (
        <Text style={[styles.none, font('regular')]}>{est.value}</Text>
      )}
    </View>
  );
}

function Line({ text, strong = false }: { text: string; strong?: boolean }) {
  return <Text style={[strong ? styles.strong : styles.muted, font(strong ? 'medium' : 'regular')]}>{text}</Text>;
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  strip: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md },
  col: { flex: 1, minWidth: 0, padding: space[3], gap: 2 },
  colBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
  label: { color: colors.textMuted, fontSize: type.footnote },
  value: { color: colors.text, fontSize: type.title, fontVariant: ['tabular-nums'] },
  profit: { color: colors.profitText },
  none: { color: colors.textMuted, fontSize: type.callout, marginTop: 2 },
  caption: { color: colors.textMuted, fontSize: type.caption },
  note: { color: colors.textMuted, fontSize: type.footnote, lineHeight: 16 },
  lines: { gap: 2 },
  muted: { color: colors.textMuted, fontSize: type.footnote, lineHeight: 16 },
  strong: { color: colors.text, fontSize: type.subhead },
  breakdown: { borderRadius: radius.md, backgroundColor: colors.grouped, paddingHorizontal: space[3] },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3], paddingVertical: 10 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rowLabel: { flex: 1, color: colors.text, fontSize: type.callout },
  rowValue: { color: colors.text, fontSize: type.callout, fontVariant: ['tabular-nums'] },
});
