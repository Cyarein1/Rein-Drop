import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { channelView, photoSrc, sellListingStatusLabel, sellPriceText } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { LoadStatus } from '@/components/LoadStatus';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { useDisplayContext } from '@/i18n/useT';
import { Badge, Button, Card, EmptyState, font, Screen } from '@/ui';

/** Your listings (decision 0019): every item you've started listing, newest first. Opened from the Inventory tab. */
export default function SellListingsScreen() {
  const router = useRouter();
  const { localeTag, t } = useDisplayContext();
  const fetch = useCallback(() => getApiClient().listSellListings(), []);
  const { state, refresh, retry } = useRefreshable(fetch, 'all');
  const listings = state.status === 'ready' ? state.data : null;

  return (
    <Screen description={t('sell.listDescription')} onRefresh={refresh} refreshing={state.status === 'ready' && state.refreshing}>
      <LoadStatus state={state} what={t('sell.loadWhat')} onRetry={retry} />
      {listings?.length === 0 && (
        <Card>
          <EmptyState
            title={t('sell.emptyTitle')}
            description={t('sell.emptyBody')}
            action={<Button onPress={() => router.navigate('/inventory')}>{t('sell.goToInventory')}</Button>}
          />
        </Card>
      )}
      {listings?.map((l) => {
        const status = sellListingStatusLabel(l.status, t);
        const cover = l.photos[0];
        const price = sellPriceText(l, localeTag);
        const live = l.channels.map((c) => channelView(c, localeTag, t)).filter((c) => c.label !== t('sell.channelEnded'));
        return (
          <Pressable
            key={l.id}
            accessibilityRole="button"
            accessibilityLabel={[l.title || t('sell.untitled'), status.label, price, ...live.map((c) => t('sell.channelLine', { name: c.name, label: c.label }))].filter(Boolean).join('. ')}
            onPress={() => router.push({ pathname: '/sell/[id]', params: { id: l.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {cover ? <Image source={{ uri: photoSrc(cover.url, apiBaseUrl.url ?? '') }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={styles.text}>
              <Text style={[styles.title, font('semibold')]} numberOfLines={2}>
                {l.title || t('sell.untitled')}
              </Text>
              <View style={styles.meta}>
                <Badge tone={status.tone}>{status.label}</Badge>
                {price && <Text style={[styles.muted, font('regular')]}>{price}</Text>}
              </View>
              {live.length > 0 && <Text style={[styles.muted, font('regular')]}>{live.map((c) => t('sell.channelLine', { name: c.name, label: c.label })).join(' · ')}</Text>}
              {l.status === 'DRAFT' && l.missing.length > 0 && <Text style={[styles.muted, font('regular')]}>{t('sell.toDo', { count: l.missing.length })}</Text>}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[3], padding: space[3], borderWidth: size.borderWidth, borderColor: roles.border, borderRadius: radius.md, backgroundColor: roles.surface },
  pressed: { opacity: 0.85 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: roles.surfaceSecondary },
  text: { flex: 1, gap: space[1] },
  title: { color: roles.text, fontSize: fontSize.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
});
