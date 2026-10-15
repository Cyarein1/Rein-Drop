import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, type MarketplaceKey, type SellDraftSuggestion, type SellListing, type SellMarketplacesResponse } from '@rein-drop/api-client';
import {
  applyDraft,
  buildSellUpdate,
  channelView,
  draftWouldReplace,
  formatMoney,
  huntFormContext,
  LISTING_CONDITION_OPTIONS,
  photoSrc,
  SELL_LISTING_STATUS_LABEL,
  sellFormFrom,
  type SellForm,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { useSessionState } from '@/auth/SessionProvider';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { Badge, Button, Card, ChoiceGroup, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

const PHOTOS_MAX = 12;
const message = (err: unknown) =>
  err instanceof ApiError ? ((err.details ?? []).map((d) => d.message).join('. ') || err.message) : isOffline(err) ? "You're offline - try again when you're connected." : String(err);

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; listing: SellListing; markets: SellMarketplacesResponse };

/**
 * List for sale (decision 0019): write the listing or "Use AI" (fills the form - everything stays
 * editable), photos from the camera, the library, the original listing, or a mix - any can be the
 * cover - then choose marketplaces and publish. eBay is simulated for now; Facebook is assisted.
 */
export default function SellListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetch = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    Promise.all([api.getSellListing(id), api.getSellMarketplaces()]).then(
      ([listing, markets]) => !cancelled && setLoad((prev) => (prev.status === 'ready' ? { ...prev, listing, markets } : { status: 'ready', listing, markets })),
      (err: unknown) => !cancelled && setLoad({ status: 'error', message: message(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);
  // Fresh signed photo links whenever the screen comes back into focus.
  useFocusEffect(fetch);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'List for sale' }} />
      {load.status === 'loading' && <LoadingState label="Loading the listing…" />}
      {load.status === 'error' && (
        <SystemBanner
          tone="error"
          title="Couldn't load the listing"
          message={load.message}
          action={
            <Button variant="secondary" onPress={() => (setLoad({ status: 'loading' }), fetch())}>
              Try again
            </Button>
          }
        />
      )}
      {load.status === 'ready' && <Editor key={load.listing.id} initial={load.listing} markets={load.markets} />}
    </Screen>
  );
}

function Editor({ initial, markets }: { initial: SellListing; markets: SellMarketplacesResponse }) {
  const { state: session } = useSessionState();
  const localeTag = huntFormContext(session.status === 'authenticated' ? session.session.user.locale : null).localeTag;
  const [listing, setListing] = useState(initial);
  const [form, setForm] = useState<SellForm>(() => sellFormFrom(initial));
  const [dirty, setDirty] = useState(false);
  const [priceError, setPriceError] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<SellDraftSuggestion | null>(null);
  const [askReplace, setAskReplace] = useState<SellDraftSuggestion | null>(null);
  const [chosen, setChosen] = useState<MarketplaceKey[]>(markets.items.map((m) => m.marketplace));
  const [postedUrl, setPostedUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const api = getApiClient();
  const base = apiBaseUrl.url ?? '';
  const currency = listing.price?.currency ?? 'ZAR';
  const status = SELL_LISTING_STATUS_LABEL[listing.status];

  const edit = (patch: Partial<SellForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const act = async (label: string, call: () => Promise<SellListing>, done?: string) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      setListing(await call());
      if (done) setNotice(done);
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const built = buildSellUpdate(form, currency);
    if (!built.ok) {
      setPriceError(built.message);
      return false;
    }
    setPriceError(undefined);
    const ok = await act('save', () => api.updateSellListing(listing.id, built.request), 'Saved.');
    if (ok) setDirty(false);
    return ok;
  };

  const take = (suggestion: SellDraftSuggestion, replace: boolean) => {
    setForm((f) => applyDraft(f, suggestion, replace));
    setDraft(suggestion);
    setAskReplace(null);
    setDirty(true);
  };

  const askAi = async () => {
    setBusy('ai');
    setError(null);
    try {
      const suggestion = await api.draftSellListing(listing.id, notes.trim() ? { notes } : {});
      if (draftWouldReplace(form)) setAskReplace(suggestion);
      else take(suggestion, false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  };

  const addPhotos = async (from: 'camera' | 'library') => {
    setError(null);
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Allow camera access in your phone settings to take photos here.');
        return;
      }
    }
    const room = PHOTOS_MAX - listing.photos.length;
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: from === 'library', selectionLimit: room };
    const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    setBusy('upload');
    try {
      for (const [i, asset] of result.assets.slice(0, room).entries()) {
        const type = asset.mimeType ?? 'image/jpeg';
        setListing(await api.uploadSellPhoto(listing.id, { uri: asset.uri, name: asset.fileName ?? `photo-${i + 1}.jpg`, type }));
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  };

  const makeCover = (photoId: string) =>
    act('cover', () => api.reorderSellPhotos(listing.id, [photoId, ...listing.photos.filter((p) => p.id !== photoId).map((p) => p.id)]), 'Cover photo changed.');

  const publish = async () => {
    if (dirty && !(await save())) return;
    await act('publish', () => api.publishSellListing(listing.id, chosen), 'Published - see where it is listed below.');
  };

  return (
    <>
      <View style={styles.row}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {listing.aiAssisted && <Badge tone="info">Written with AI - check it</Badge>}
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {listing.title || 'New listing'}
      </Text>
      {error && <SystemBanner tone="error" title="That didn't work" message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      <Card title="Write the listing">
        <TextInput label="Anything the AI should know? (optional)" value={notes} maxLength={500} placeholder="e.g. battery 89%, small scratch, comes with box" onChangeText={setNotes} />
        <Button variant="secondary" loading={busy === 'ai'} disabled={!markets.ai} onPress={() => void askAi()}>
          Use AI
        </Button>
        {!markets.ai && <Text style={[styles.muted, font('regular')]}>AI drafts aren&apos;t set up here yet - write it yourself.</Text>}
        {askReplace && (
          <SystemBanner
            tone="info"
            title="Replace what you've written?"
            message="The AI draft is ready."
            action={
              <View style={styles.row}>
                <Button variant="secondary" onPress={() => take(askReplace, true)}>
                  Replace
                </Button>
                <Button variant="text" onPress={() => take(askReplace, false)}>
                  Only fill empty fields
                </Button>
              </View>
            }
          />
        )}
        {draft && (
          <SystemBanner
            tone="info"
            title="Filled in from the AI draft - edit anything"
            message={[
              draft.suggestedPrice ? `Suggested price from the resale estimate: ${formatMoney(draft.suggestedPrice.amount, localeTag)} (an estimate, not a guarantee).` : 'No resale estimate for this item - set your own price.',
              ...draft.checks,
            ].join(' ')}
          />
        )}
        <TextInput label="Title" value={form.title} maxLength={80} hint={`${form.title.length} / 80`} onChangeText={(title) => edit({ title })} />
        <ChoiceGroup legend="Condition" options={LISTING_CONDITION_OPTIONS} value={form.condition ?? ('' as never)} onChange={(condition) => edit({ condition })} />
        <TextInput label="Your price" kind="money" currency={currency} value={form.price} error={priceError} onChangeText={(price) => edit({ price })} />
        <TextInput label="Description" value={form.description} maxLength={4000} multiline numberOfLines={6} textAlignVertical="top" onChangeText={(description) => edit({ description })} />
        {form.itemSpecifics.length > 0 && (
          <View style={styles.stack}>
            <Text style={[styles.label, font('semibold')]}>Item details</Text>
            {form.itemSpecifics.map((s, i) => (
              <View key={i} style={styles.specific}>
                <View style={styles.flex}>
                  <TextInput label="Name" value={s.name} maxLength={40} onChangeText={(name) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, name } : x)) })} />
                </View>
                <View style={styles.flex}>
                  <TextInput label="Value" value={s.value} maxLength={80} onChangeText={(value) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, value } : x)) })} />
                </View>
                <Button variant="text" accessibilityLabel={`Remove ${s.name || 'detail'}`} onPress={() => edit({ itemSpecifics: form.itemSpecifics.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </View>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <Button variant="text" onPress={() => edit({ itemSpecifics: [...form.itemSpecifics, { name: '', value: '' }] })}>
            Add a detail
          </Button>
          <Button variant="secondary" loading={busy === 'save'} disabled={!dirty} onPress={() => void save()}>
            Save
          </Button>
        </View>
      </Card>

      <Card title="Photos" action={<Text style={[styles.muted, font('regular')]}>{`${listing.photos.length} / ${PHOTOS_MAX}`}</Text>}>
        <Text style={[styles.muted, font('regular')]}>The first photo is the cover. Tap Make cover to change it.</Text>
        <View style={styles.grid}>
          {listing.photos.map((p, i) => (
            <View key={p.id} style={styles.tile}>
              <Image source={{ uri: photoSrc(p.url, base) }} style={styles.thumb} accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', cover' : ''}`} />
              {i === 0 ? (
                <Badge tone="action">Cover</Badge>
              ) : (
                <Button variant="text" disabled={busy !== null} onPress={() => void makeCover(p.id)}>
                  Make cover
                </Button>
              )}
              <Button variant="text" accessibilityLabel={`Remove photo ${i + 1}`} disabled={busy !== null} onPress={() => void act('remove', () => api.removeSellPhoto(listing.id, p.id))}>
                Remove
              </Button>
            </View>
          ))}
        </View>
        {markets.uploads ? (
          <View style={styles.row}>
            <Button variant="secondary" loading={busy === 'upload'} disabled={listing.photos.length >= PHOTOS_MAX} onPress={() => void addPhotos('camera')}>
              Take photos
            </Button>
            <Button variant="secondary" disabled={busy !== null || listing.photos.length >= PHOTOS_MAX} onPress={() => void addPhotos('library')}>
              Choose from library
            </Button>
          </View>
        ) : (
          <Text style={[styles.muted, font('regular')]}>Adding your own photos isn&apos;t available here yet.</Text>
        )}
        {listing.sourcePhotos.length > 0 && (
          <View style={styles.stack}>
            <Text style={[styles.label, font('semibold')]}>From the original listing</Text>
            <View style={styles.grid}>
              {listing.sourcePhotos.map((url, i) => (
                <Pressable
                  key={url}
                  style={styles.tile}
                  accessibilityRole="button"
                  accessibilityLabel={`Add original listing photo ${i + 1}`}
                  disabled={busy !== null || listing.photos.length >= PHOTOS_MAX}
                  onPress={() => void act('source', () => api.addSourcePhoto(listing.id, url))}
                >
                  <Image source={{ uri: url }} style={styles.thumb} />
                  <Text style={[styles.body, font('semibold')]}>+ Add</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.muted, font('regular')]}>These were taken by the original seller. Some marketplaces reject reused photos - your own are safest.</Text>
          </View>
        )}
      </Card>

      <Card title="Where to list">
        <ChoiceGroup multiple legend="Marketplaces" options={markets.items.map((m) => ({ value: m.marketplace, label: m.label }))} value={chosen} onChange={setChosen} />
        {markets.items.map((m) => (
          <Text key={m.marketplace} style={[styles.muted, font('regular')]}>{`${m.label}: ${m.note}`}</Text>
        ))}
        {listing.missing.length > 0 && <SystemBanner tone="info" title="Before you can publish" message={listing.missing.join(' · ')} />}
        <Button loading={busy === 'publish'} disabled={chosen.length === 0 || busy !== null} onPress={() => void publish()}>
          {listing.status === 'PUBLISHED' ? 'Publish to more marketplaces' : 'Publish'}
        </Button>
      </Card>

      {listing.channels.length > 0 && (
        <Card title="Where it's listed">
          {listing.channels.map((c) => {
            const v = channelView(c, localeTag);
            return (
              <View key={c.marketplace} style={styles.channel}>
                <View style={styles.row}>
                  <Text style={[styles.body, font('semibold')]}>{v.name}</Text>
                  <Badge tone={v.tone}>{v.label}</Badge>
                </View>
                {v.detail && <Text style={[styles.muted, font('regular')]}>{v.detail}</Text>}
                {c.url && (
                  <Button variant="text" onPress={() => void Linking.openURL(c.url!)}>
                    Open listing ↗
                  </Button>
                )}
                {v.awaiting && c.assist && (
                  <View style={styles.stack}>
                    <Text selectable style={[styles.assist, font('regular')]}>
                      {c.assist.text}
                    </Text>
                    <View style={styles.row}>
                      <Button variant="secondary" onPress={() => void Clipboard.setStringAsync(c.assist!.text).then(() => setNotice(`Copied - paste it on ${v.name}.`))}>
                        Copy text
                      </Button>
                      <Button variant="secondary" onPress={() => void Linking.openURL(c.assist!.openUrl)}>
                        {`Open ${v.name} ↗`}
                      </Button>
                    </View>
                    <TextInput label="Link to your listing (optional)" value={postedUrl} autoCapitalize="none" onChangeText={setPostedUrl} />
                    <Button variant="secondary" loading={busy === `confirm-${c.marketplace}`} onPress={() => void act(`confirm-${c.marketplace}`, () => api.confirmSellChannel(listing.id, c.marketplace, postedUrl.trim() || undefined), 'Marked as posted.')}>
                      I&apos;ve posted it
                    </Button>
                  </View>
                )}
                {v.canEnd && (
                  <Button variant="text" loading={busy === `end-${c.marketplace}`} onPress={() => void act(`end-${c.marketplace}`, () => api.endSellChannel(listing.id, c.marketplace), `Taken down on ${v.name}.`)}>
                    {c.mode === 'assisted' ? "I've taken it down" : 'Take it down'}
                  </Button>
                )}
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  heading: { color: roles.text, fontSize: fontSize['2xl'] },
  body: { color: roles.text, fontSize: fontSize.md },
  muted: { color: roles.textMuted, fontSize: fontSize.sm },
  label: { color: roles.text, fontSize: fontSize.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  stack: { gap: space[2] },
  flex: { flex: 1 },
  specific: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  tile: { width: 104, gap: space[1], alignItems: 'flex-start' },
  thumb: { width: 104, height: 104, borderRadius: radius.sm, borderWidth: size.borderWidth, borderColor: roles.border, backgroundColor: roles.surfaceSecondary },
  channel: { gap: space[2], paddingVertical: space[2], borderBottomWidth: size.borderWidth, borderBottomColor: roles.border },
  assist: { color: roles.text, fontSize: fontSize.sm, padding: space[3], borderRadius: radius.sm, backgroundColor: roles.surfaceSecondary },
});
