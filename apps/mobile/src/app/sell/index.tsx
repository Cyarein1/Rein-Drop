import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { SellListing } from '@rein-drop/api-client';
import { channelView, photoSrc, sellListingStatusLabel, sellPriceText } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { MarketplaceMark } from '@/brand/MarketplaceMark';
import { LoadStatus } from '@/components/LoadStatus';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, Button, colors, EmptyState, font, GUTTER, SkeletonRows, Thumb, type } from '@/ui';

/** Your listings (decision 0019): every item you've started listing, newest first, as photo rows. Opened from the Inventory header. */
export default function SellListingsScreen() {
  const router = useRouter();
  const { t } = useDisplayContext();
  const fetch = useCallback(() => getApiClient().listSellListings(), []);
  const { state, refresh, retry } = useRefreshable(fetch, 'all');
  const listings = state.status === 'ready' ? state.data : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('nav.titleListings') }} />
      {state.status === 'loading' ? (
        <SkeletonRows thumb={72} />
      ) : (
        <FlatList
          data={listings ?? []}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <ListingRow listing={item} onPress={() => router.push({ pathname: '/sell/[id]', params: { id: item.id } })} />}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={<RefreshControl refreshing={state.status === 'ready' && state.refreshing} onRefresh={refresh} tintColor={colors.text} accessibilityLabel={t('common.pullToRefresh')} />}
          ListHeaderComponent={
            <View style={styles.status}>
              <LoadStatus state={state} what={t('sell.loadWhat')} onRetry={retry} />
            </View>
          }
          ListEmptyComponent={
            listings ? (
              <EmptyState
                title={t('sell.emptyTitle')}
                description={t('sell.emptyBody')}
                action={<Button onPress={() => router.navigate('/inventory')}>{t('sell.goToInventory')}</Button>}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

function ListingRow({ listing: l, onPress }: { listing: SellListing; onPress: () => void }) {
  const { localeTag, t } = useDisplayContext();
  const status = sellListingStatusLabel(l.status, t);
  const cover = l.photos[0];
  const price = sellPriceText(l, localeTag);
  const live = l.channels.map((c) => channelView(c, localeTag, t)).filter((c) => c.label !== t('sell.channelEnded'));
  const title = l.title || t('sell.untitled');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status.label, price, ...live.map((c) => t('sell.channelLine', { name: c.name, label: c.label }))].filter(Boolean).join('. ')}
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
        {l.status === 'DRAFT' && l.missing.length > 0 && <Text style={[styles.todo, font('medium')]}>{t('sell.toDo', { count: l.missing.length })}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  status: { paddingHorizontal: GUTTER },
  row: { flexDirection: 'row', gap: space[3], paddingHorizontal: GUTTER, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  pressed: { backgroundColor: colors.grouped },
  text: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: colors.text, fontSize: type.body, lineHeight: 20 },
  price: { color: colors.text, fontSize: type.price },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  muted: { color: colors.textMuted, fontSize: type.footnote },
  todo: { color: colors.warningText, fontSize: type.footnote },
});
