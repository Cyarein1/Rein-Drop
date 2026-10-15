import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { channelView, huntFormContext, photoSrc, SELL_LISTING_STATUS_LABEL, sellPriceText } from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { LoadStatus } from '@/components/LoadStatus';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { useRefreshable } from '@/data/useRefreshable';
import { Badge, Button, Card, EmptyState, font, Screen } from '@/ui';

/** Your listings (decision 0019): every item you've started listing, newest first. Opened from the Inventory tab. */
export default function SellListingsScreen() {
  const router = useRouter();
  const { state: session } = useSessionState();
  const localeTag = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null).localeTag;
  const fetch = useCallback(() => getApiClient().listSellListings(), []);
  const { state, refresh, retry } = useRefreshable(fetch, 'all');
  const listings = state.status === 'ready' ? state.data : null;

  return (
    <Screen description="What you're selling and where it's listed." onRefresh={refresh} refreshing={state.status === 'ready' && state.refreshing}>
      <LoadStatus state={state} what="listings" onRetry={retry} />
      {listings?.length === 0 && (
        <Card>
          <EmptyState
            title="Nothing listed yet"
            description="Open something you bought in Inventory and choose List for sale."
            action={<Button onPress={() => router.navigate('/inventory')}>Go to inventory</Button>}
          />
        </Card>
      )}
      {listings?.map((l) => {
        const status = SELL_LISTING_STATUS_LABEL[l.status];
        const cover = l.photos[0];
        const price = sellPriceText(l, localeTag);
        const live = l.channels.map((c) => channelView(c, localeTag)).filter((c) => c.label !== 'Ended');
        return (
          <Pressable
            key={l.id}
            accessibilityRole="button"
            accessibilityLabel={[l.title || 'Untitled listing', status.label, price, ...live.map((c) => `${c.name} ${c.label}`)].filter(Boolean).join('. ')}
            onPress={() => router.push({ pathname: '/sell/[id]', params: { id: l.id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {cover ? <Image source={{ uri: photoSrc(cover.url, apiBaseUrl.url ?? '') }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={styles.text}>
              <Text style={[styles.title, font('semibold')]} numberOfLines={2}>
                {l.title || 'Untitled listing'}
              </Text>
              <View style={styles.meta}>
                <Badge tone={status.tone}>{status.label}</Badge>
                {price && <Text style={[styles.muted, font('regular')]}>{price}</Text>}
              </View>
              {live.length > 0 && <Text style={[styles.muted, font('regular')]}>{live.map((c) => `${c.name}: ${c.label}`).join(' · ')}</Text>}
              {l.status === 'DRAFT' && l.missing.length > 0 && <Text style={[styles.muted, font('regular')]}>{`${l.missing.length} to do before publishing`}</Text>}
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
