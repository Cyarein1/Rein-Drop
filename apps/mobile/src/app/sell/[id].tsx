import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Translator } from '@rein-drop/i18n';
import { ApiError, type MarketplaceKey, type SellDraftSuggestion, type SellListing, type SellMarketplacesResponse } from '@rein-drop/api-client';
import {
  applyDraft,
  buildSellUpdate,
  channelView,
  draftWouldReplace,
  formatMoney,
  listingConditionOptions,
  photoSrc,
  sellListingStatusLabel,
  sellFormFrom,
  type SellForm,
} from '@rein-drop/client-core';
import { fontSize, radius, roles, size, space } from '@rein-drop/design-tokens';
import { MarketplaceMark, MarketplaceName } from '@/brand/MarketplaceMark';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { useDisplayContext, useT } from '@/i18n/useT';
import { Badge, Button, Card, ChoiceGroup, font, LoadingState, Screen, SystemBanner, TextInput } from '@/ui';

const PHOTOS_MAX = 12;
const message = (err: unknown, t: Translator) =>
  err instanceof ApiError ? ((err.details ?? []).map((d) => d.message).join('. ') || err.message) : isOffline(err) ? t('sell.offline') : String(err);

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; listing: SellListing; markets: SellMarketplacesResponse };

/**
 * List for sale (decision 0019): write the listing or "Use AI" (fills the form - everything stays
 * editable), photos from the camera, the library, the original listing, or a mix - any can be the
 * cover - then choose marketplaces and publish. eBay is simulated for now; Facebook is assisted.
 */
export default function SellListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const t = useT();

  const fetch = useCallback(() => {
    let cancelled = false;
    const api = getApiClient();
    Promise.all([api.getSellListing(id), api.getSellMarketplaces()]).then(
      ([listing, markets]) => !cancelled && setLoad((prev) => (prev.status === 'ready' ? { ...prev, listing, markets } : { status: 'ready', listing, markets })),
      (err: unknown) => !cancelled && setLoad({ status: 'error', message: message(err, t) }),
    );
    return () => {
      cancelled = true;
    };
  }, [id, t]);
  // Fresh signed photo links whenever the screen comes back into focus.
  useFocusEffect(fetch);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('sell.screenTitle') }} />
      {load.status === 'loading' && <LoadingState label={t('sell.loading')} />}
      {load.status === 'error' && (
        <SystemBanner
          tone="error"
          title={t('sell.loadFailed')}
          message={load.message}
          action={
            <Button variant="secondary" onPress={() => (setLoad({ status: 'loading' }), fetch())}>
              {t('sell.tryAgain')}
            </Button>
          }
        />
      )}
      {load.status === 'ready' && <Editor key={load.listing.id} initial={load.listing} markets={load.markets} />}
    </Screen>
  );
}

function Editor({ initial, markets }: { initial: SellListing; markets: SellMarketplacesResponse }) {
  const { localeTag, t } = useDisplayContext();
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
  const status = sellListingStatusLabel(listing.status, t);

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
      setError(message(err, t));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const built = buildSellUpdate(form, currency, t);
    if (!built.ok) {
      setPriceError(built.message);
      return false;
    }
    setPriceError(undefined);
    const ok = await act('save', () => api.updateSellListing(listing.id, built.request), t('sell.saved'));
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
      setError(message(err, t));
    } finally {
      setBusy(null);
    }
  };

  const addPhotos = async (from: 'camera' | 'library') => {
    setError(null);
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t('sell.cameraPermission'));
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
      setError(message(err, t));
    } finally {
      setBusy(null);
    }
  };

  const makeCover = (photoId: string) =>
    act('cover', () => api.reorderSellPhotos(listing.id, [photoId, ...listing.photos.filter((p) => p.id !== photoId).map((p) => p.id)]), t('sell.coverChanged'));

  const publish = async () => {
    if (dirty && !(await save())) return;
    await act('publish', () => api.publishSellListing(listing.id, chosen), t('sell.published'));
  };

  return (
    <>
      <View style={styles.row}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {listing.aiAssisted && <Badge tone="info">{t('sell.aiBadge')}</Badge>}
      </View>
      <Text style={[styles.heading, font('bold')]} accessibilityRole="header">
        {listing.title || t('sell.newListing')}
      </Text>
      {error && <SystemBanner tone="error" title={t('sell.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.muted, font('regular')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      <Card title={t('sell.writeTitle')}>
        <TextInput label={t('sell.aiNotes')} value={notes} maxLength={500} placeholder={t('sell.aiNotesPlaceholder')} onChangeText={setNotes} />
        <Button variant="secondary" loading={busy === 'ai'} disabled={!markets.ai} onPress={() => void askAi()}>
          {t('sell.useAi')}
        </Button>
        {!markets.ai && <Text style={[styles.muted, font('regular')]}>{t('sell.aiUnavailable')}</Text>}
        {askReplace && (
          <SystemBanner
            tone="info"
            title={t('sell.replaceTitle')}
            message={t('sell.replaceBody')}
            action={
              <View style={styles.row}>
                <Button variant="secondary" onPress={() => take(askReplace, true)}>
                  {t('sell.replace')}
                </Button>
                <Button variant="text" onPress={() => take(askReplace, false)}>
                  {t('sell.fillEmpty')}
                </Button>
              </View>
            }
          />
        )}
        {draft && (
          <SystemBanner
            tone="info"
            title={t('sell.filledTitle')}
            message={[
              draft.suggestedPrice ? t('sell.suggestedPrice', { amount: formatMoney(draft.suggestedPrice.amount, localeTag) }) : t('sell.noSuggestedPrice'),
              ...draft.checks,
            ].join(' ')}
          />
        )}
        <TextInput label={t('sell.formTitle')} value={form.title} maxLength={80} hint={t('sell.charCount', { count: form.title.length, max: 80 })} onChangeText={(title) => edit({ title })} />
        <ChoiceGroup legend={t('sell.formCondition')} options={listingConditionOptions(t)} value={form.condition ?? ('' as never)} onChange={(condition) => edit({ condition })} />
        <TextInput label={t('sell.formPrice')} kind="money" currency={currency} value={form.price} error={priceError} onChangeText={(price) => edit({ price })} />
        <TextInput label={t('sell.formDescription')} value={form.description} maxLength={4000} multiline numberOfLines={6} textAlignVertical="top" onChangeText={(description) => edit({ description })} />
        {form.itemSpecifics.length > 0 && (
          <View style={styles.stack}>
            <Text style={[styles.label, font('semibold')]}>{t('sell.itemDetails')}</Text>
            {form.itemSpecifics.map((s, i) => (
              <View key={i} style={styles.specific}>
                <View style={styles.flex}>
                  <TextInput label={t('sell.detailName')} value={s.name} maxLength={40} onChangeText={(name) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, name } : x)) })} />
                </View>
                <View style={styles.flex}>
                  <TextInput label={t('sell.detailValue')} value={s.value} maxLength={80} onChangeText={(value) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, value } : x)) })} />
                </View>
                <Button variant="text" accessibilityLabel={s.name ? t('sell.removeNamed', { name: s.name }) : t('sell.removeDetail')} onPress={() => edit({ itemSpecifics: form.itemSpecifics.filter((_, j) => j !== i) })}>
                  {t('sell.remove')}
                </Button>
              </View>
            ))}
          </View>
        )}
        <View style={styles.row}>
          <Button variant="text" onPress={() => edit({ itemSpecifics: [...form.itemSpecifics, { name: '', value: '' }] })}>
            {t('sell.addDetail')}
          </Button>
          <Button variant="secondary" loading={busy === 'save'} disabled={!dirty} onPress={() => void save()}>
            {t('sell.save')}
          </Button>
        </View>
      </Card>

      <Card title={t('sell.photos')} action={<Text style={[styles.muted, font('regular')]}>{t('sell.charCount', { count: listing.photos.length, max: PHOTOS_MAX })}</Text>}>
        <Text style={[styles.muted, font('regular')]}>{t('sell.coverHint')}</Text>
        <View style={styles.grid}>
          {listing.photos.map((p, i) => (
            <View key={p.id} style={styles.tile}>
              <Image source={{ uri: photoSrc(p.url, base) }} style={styles.thumb} accessibilityLabel={i === 0 ? t('sell.photoCoverA11y', { number: i + 1 }) : t('sell.photoA11y', { number: i + 1 })} />
              {i === 0 ? (
                <Badge tone="action">{t('sell.cover')}</Badge>
              ) : (
                <Button variant="text" disabled={busy !== null} onPress={() => void makeCover(p.id)}>
                  {t('sell.makeCover')}
                </Button>
              )}
              <Button variant="text" accessibilityLabel={t('sell.removePhotoA11y', { number: i + 1 })} disabled={busy !== null} onPress={() => void act('remove', () => api.removeSellPhoto(listing.id, p.id))}>
                {t('sell.remove')}
              </Button>
            </View>
          ))}
        </View>
        {markets.uploads ? (
          <View style={styles.row}>
            <Button variant="secondary" loading={busy === 'upload'} disabled={listing.photos.length >= PHOTOS_MAX} onPress={() => void addPhotos('camera')}>
              {t('sell.takePhotos')}
            </Button>
            <Button variant="secondary" disabled={busy !== null || listing.photos.length >= PHOTOS_MAX} onPress={() => void addPhotos('library')}>
              {t('sell.chooseLibrary')}
            </Button>
          </View>
        ) : (
          <Text style={[styles.muted, font('regular')]}>{t('sell.uploadsUnavailable')}</Text>
        )}
        {listing.sourcePhotos.length > 0 && (
          <View style={styles.stack}>
            <Text style={[styles.label, font('semibold')]}>{t('sell.fromOriginal')}</Text>
            <View style={styles.grid}>
              {listing.sourcePhotos.map((url, i) => (
                <Pressable
                  key={url}
                  style={styles.tile}
                  accessibilityRole="button"
                  accessibilityLabel={t('sell.addSourcePhotoA11y', { number: i + 1 })}
                  disabled={busy !== null || listing.photos.length >= PHOTOS_MAX}
                  onPress={() => void act('source', () => api.addSourcePhoto(listing.id, url))}
                >
                  <Image source={{ uri: url }} style={styles.thumb} />
                  <Text style={[styles.body, font('semibold')]}>{t('sell.add')}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.muted, font('regular')]}>{t('sell.sourcePhotosNote')}</Text>
          </View>
        )}
      </Card>

      <Card title={t('sell.whereToList')}>
        <ChoiceGroup multiple legend={t('sell.marketplaces')} options={markets.items.map((m) => ({ value: m.marketplace, label: m.label, icon: <MarketplaceMark marketplace={m.marketplace} size={18} /> }))} value={chosen} onChange={setChosen} />
        {markets.items.map((m) => (
          <Text key={m.marketplace} style={[styles.muted, font('regular')]}>{t('sell.channelLine', { name: m.label, label: m.note })}</Text>
        ))}
        {listing.missing.length > 0 && <SystemBanner tone="info" title={t('sell.beforePublish')} message={listing.missing.join(' · ')} />}
        <Button loading={busy === 'publish'} disabled={chosen.length === 0 || busy !== null} onPress={() => void publish()}>
          {listing.status === 'PUBLISHED' ? t('sell.publishMore') : t('sell.publish')}
        </Button>
      </Card>

      {listing.channels.length > 0 && (
        <Card title={t('sell.whereListed')}>
          {listing.channels.map((c) => {
            const v = channelView(c, localeTag, t);
            return (
              <View key={c.marketplace} style={styles.channel}>
                <View style={styles.row}>
                  <MarketplaceName marketplace={c.marketplace} size={18} textStyle={[styles.body, font('semibold')]} />
                  <Badge tone={v.tone}>{v.label}</Badge>
                </View>
                {v.detail && <Text style={[styles.muted, font('regular')]}>{v.detail}</Text>}
                {c.url && (
                  <Button variant="text" onPress={() => void Linking.openURL(c.url!)}>
                    {t('sell.openListing')}
                  </Button>
                )}
                {v.awaiting && c.assist && (
                  <View style={styles.stack}>
                    <Text selectable style={[styles.assist, font('regular')]}>
                      {c.assist.text}
                    </Text>
                    <View style={styles.row}>
                      <Button variant="secondary" onPress={() => void Clipboard.setStringAsync(c.assist!.text).then(() => setNotice(t('sell.copied', { name: v.name })))}>
                        {t('sell.copyText')}
                      </Button>
                      <Button variant="secondary" icon={<MarketplaceMark marketplace={c.marketplace} size={16} />} onPress={() => void Linking.openURL(c.assist!.openUrl)}>
                        {t('sell.openMarketplace', { name: v.name })}
                      </Button>
                    </View>
                    <TextInput label={t('sell.postedLink')} value={postedUrl} autoCapitalize="none" onChangeText={setPostedUrl} />
                    <Button variant="secondary" loading={busy === `confirm-${c.marketplace}`} onPress={() => void act(`confirm-${c.marketplace}`, () => api.confirmSellChannel(listing.id, c.marketplace, postedUrl.trim() || undefined), t('sell.markedPosted'))}>
                      {t('sell.posted')}
                    </Button>
                  </View>
                )}
                {v.canEnd && (
                  <Button variant="text" loading={busy === `end-${c.marketplace}`} onPress={() => void act(`end-${c.marketplace}`, () => api.endSellChannel(listing.id, c.marketplace), t('sell.takenDown', { name: v.name }))}>
                    {c.mode === 'assisted' ? t('sell.tookDown') : t('sell.takeDown')}
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
