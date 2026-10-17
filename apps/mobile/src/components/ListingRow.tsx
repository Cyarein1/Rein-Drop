import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SellListing } from '@rein-drop/api-client';
import { channelView, photoSrc, sellListingStatusLabel, sellPriceText } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { apiBaseUrl } from '@/config/api';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, colors, font, GUTTER, Thumb, type } from '@/ui';

/**
 * One sell listing as a photo row (Sell tab, Listings section): cover, title, price, status and
 * where it's live; drafts show what's left to do, ended ones a "take it down yourself" reminder.
 */
export function ListingRow({ listing: l, onPress }: { listing: SellListing; onPress: () => void }) {
  const { localeTag, t } = useDisplayContext();
  const status = sellListingStatusLabel(l.status, t);
  const cover = l.photos[0];
  const price = sellPriceText(l, localeTag);
  const live = l.channels.map((c) => channelView(c, localeTag, t)).filter((c) => c.label !== t('sell.channelEnded'));
  const title = l.title || t('sell.untitled');
  const remove = l.removeManually.length > 0 ? t('inventory.removeManuallyTitle') : null;
  const todo = l.status === 'DRAFT' && l.missing.length > 0 ? t('sell.toDo', { count: l.missing.length }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status.label, price, ...live.map((c) => t('sell.channelLine', { name: c.name, label: c.label })), todo, remove].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Thumb uri={cover ? photoSrc(cover.url, apiBaseUrl.url ?? '') : null} size={72} />
      <View style={styles.text}>
        <Text style={[styles.title, font('medium')]} numberOfLines={2}>
          {title}
        </Text>
        {price && <Text style={[styles.price, font('bold')]}>{price}</Text>}
        <View style={styles.meta}>
          <Badge tone={status.tone}>{status.label}</Badge>
          {live.map((c) => (
            <View key={c.marketplace} style={styles.channel}>
              <MarketplaceMark marketplace={c.marketplace} size={14} />
              <Text style={[styles.muted, font('regular')]} numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>
        {todo && <Text style={[styles.todo, font('medium')]}>{todo}</Text>}
        {remove && <Text style={[styles.todo, font('medium')]}>{remove}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], paddingHorizontal: GUTTER, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator, backgroundColor: colors.background },
  pressed: { backgroundColor: colors.grouped },
  text: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: colors.text, fontSize: type.body, lineHeight: 20 },
  price: { color: colors.text, fontSize: type.price },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  muted: { color: colors.textMuted, fontSize: type.footnote },
  todo: { color: colors.warningText, fontSize: type.footnote },
});
