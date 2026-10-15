import { StyleSheet, Text, View } from 'react-native';
import { estimateNote, type DealDetailView } from '@rein-drop/client-core';
import { fontSize, roles, space } from '@rein-drop/design-tokens';
import { useT } from '@/i18n/useT';
import { Card, font, Metric } from '@/ui';

/**
 * The deal's economics for a quick decision: asking price and known costs (facts), then the
 * estimated resale value and potential upside (always labelled "Estimated", with their range),
 * and the note that estimates are never guaranteed profit. All figures come from the shared
 * view model - nothing is calculated here.
 */
export function DealEconomics({ view }: { view: Pick<DealDetailView, 'priceLines' | 'maxPriceNote' | 'resale' | 'upside' | 'targetNote' | 'notIncluded'> }) {
  const t = useT();
  return (
    <Card title={t('deals.priceAndEstimates')}>
      {view.priceLines.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={[styles.body, font('regular')]}>{label}</Text>
          <Text style={[styles.body, font('semibold')]}>{value}</Text>
        </View>
      ))}
      {view.maxPriceNote && <Text style={[styles.body, font('regular')]}>{view.maxPriceNote}</Text>}
      <View style={styles.metrics}>
        <Metric label={t('deals.resaleValue')} value={view.resale.value} estimated={view.resale.estimated} caption={view.resale.caption} />
        <Metric label={t('deals.potentialUpside')} value={view.upside.value} estimated={view.upside.estimated} caption={view.upside.caption} />
      </View>
      {view.targetNote && <Text style={[styles.muted, font('regular')]}>{view.targetNote}</Text>}
      {view.notIncluded && <Text style={[styles.muted, font('regular')]}>{view.notIncluded}</Text>}
      <Text style={[styles.muted, font('regular')]}>{estimateNote(t)}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  metrics: { gap: space[3] },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
