import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { radius, space } from '@rein-drop/design-tokens';
import { MarketplaceMark, MarketplaceName } from '@/brand/MarketplaceMark';
import { AddRow, Section } from '@/components/FormRows';
import { apiBaseUrl, getApiClient } from '@/config/api';
import { isOffline } from '@/data/useRefreshable';
import { useDisplayContext, useT } from '@/i18n/useT';
import { ActionBar, Badge, Button, ChipBar, colors, font, GUTTER, haptic, Icon, icons, LoadingState, Screen, SystemBanner, TextInput, Thumb, type, type IconName } from '@/ui';

const PHOTOS_MAX = 12;
const TILE = 96;
const CAMERA: IconName = { ios: 'camera', android: 'photo_camera' };
const SPARKLES: IconName = { ios: 'sparkles', android: 'auto_awesome' };
const message = (err: unknown, t: Translator) =>
  err instanceof ApiError ? ((err.details ?? []).map((d) => d.message).join('. ') || err.message) : isOffline(err) ? t('sell.offline') : String(err);

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; listing: SellListing; markets: SellMarketplacesResponse };

/**
 * List for sale (decision 0019; mock-up DealDetail): a sideways photo strip - camera, library, the
 * original listing, or a mix, any can be the cover - then the listing (written or "Use AI", which
 * fills the form and everything stays editable), the marketplaces, and Save / Publish in a fixed
 * bar. eBay is simulated for now; Facebook is assisted (copy, open, confirm).
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

  if (load.status === 'ready') return <Editor key={load.listing.id} initial={load.listing} markets={load.markets} />;
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
  // The item's currency (the API refuses any other); never a hard-coded one.
  const currency = listing.currency;
  const status = sellListingStatusLabel(listing.status, t);
  const full = listing.photos.length >= PHOTOS_MAX;

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
    if (await act('publish', () => api.publishSellListing(listing.id, chosen), t('sell.published'))) haptic.success();
  };

  return (
    <Screen
      footer={
        <ActionBar>
          <Button variant="secondary" size="large" fullWidth loading={busy === 'save'} disabled={!dirty || (busy !== null && busy !== 'save')} onPress={() => void save()}>
            {t('sell.save')}
          </Button>
          <Button size="large" fullWidth loading={busy === 'publish'} disabled={chosen.length === 0 || busy !== null} onPress={() => void publish()}>
            {listing.status === 'PUBLISHED' ? t('sell.publishMore') : t('sell.publish')}
          </Button>
        </ActionBar>
      }
    >
      <Stack.Screen options={{ title: t('sell.screenTitle') }} />

      {/* Photos: a strip that scrolls sideways (no scrollbar); the first is the cover. */}
      <View style={styles.block}>
        <View style={styles.head}>
          <Text style={[styles.sectionTitle, font('semibold')]} accessibilityRole="header">
            {t('sell.photos')}
          </Text>
          <Text style={[styles.muted, font('regular')]}>{t('sell.charCount', { count: listing.photos.length, max: PHOTOS_MAX })}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripRow}>
          {listing.photos.map((p, i) => (
            <View key={p.id} style={styles.tile}>
              <View accessible accessibilityRole="image" accessibilityLabel={i === 0 ? t('sell.photoCoverA11y', { number: i + 1 }) : t('sell.photoA11y', { number: i + 1 })}>
                <Thumb uri={photoSrc(p.url, base)} size={TILE} rounded={radius.md} />
                {i === 0 && (
                  <View style={styles.coverBadge}>
                    <Badge tone="action">{t('sell.cover')}</Badge>
                  </View>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sell.removePhotoA11y', { number: i + 1 })}
                disabled={busy !== null}
                onPress={() => void act('remove', () => api.removeSellPhoto(listing.id, p.id))}
                hitSlop={8}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              >
                <Icon name={icons.close} color={colors.background} size={12} />
              </Pressable>
              {i > 0 && (
                <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void makeCover(p.id)} hitSlop={6} style={({ pressed }) => [styles.tileAction, pressed && styles.pressed]}>
                  <Text style={[styles.tileActionText, font('medium')]}>{t('sell.makeCover')}</Text>
                </Pressable>
              )}
            </View>
          ))}
          {markets.uploads && (
            <>
              <AddTile icon={CAMERA} label={t('sell.takePhotos')} disabled={full || busy !== null} busy={busy === 'upload'} onPress={() => void addPhotos('camera')} />
              <AddTile icon={icons.photo} label={t('sell.chooseLibrary')} disabled={full || busy !== null} onPress={() => void addPhotos('library')} />
            </>
          )}
        </ScrollView>
        <Text style={[styles.muted, font('regular')]}>{markets.uploads ? t('sell.coverHint') : t('sell.uploadsUnavailable')}</Text>
      </View>

      {listing.sourcePhotos.length > 0 && (
        <View style={styles.block}>
          <Text style={[styles.label, font('semibold')]}>{t('sell.fromOriginal')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripRow}>
            {listing.sourcePhotos.map((url, i) => (
              <Pressable
                key={url}
                accessibilityRole="button"
                accessibilityLabel={t('sell.addSourcePhotoA11y', { number: i + 1 })}
                disabled={busy !== null || full}
                onPress={() => void act('source', () => api.addSourcePhoto(listing.id, url))}
                style={({ pressed }) => [styles.sourceTile, pressed && styles.pressed, (busy !== null || full) && styles.disabled]}
              >
                <Thumb uri={url} size={72} rounded={radius.md} />
                <View style={styles.sourceAdd}>
                  <Text style={[styles.sourceAddText, font('semibold')]}>{t('sell.add')}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.muted, font('regular')]}>{t('sell.sourcePhotosNote')}</Text>
        </View>
      )}

      <View style={styles.badges}>
        <Badge tone={status.tone}>{status.label}</Badge>
        {listing.aiAssisted && <Badge tone="info">{t('sell.aiBadge')}</Badge>}
      </View>
      {error && <SystemBanner tone="error" title={t('sell.actionFailed')} message={error} />}
      {notice && (
        <Text style={[styles.notice, font('medium')]} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      )}

      {/* Use AI: fills the form below; nothing is saved until Save / Publish. */}
      <View style={styles.ai}>
        <Text style={[styles.sectionTitle, font('semibold')]} accessibilityRole="header">
          {t('sell.writeTitle')}
        </Text>
        <TextInput label={t('sell.aiNotes')} value={notes} maxLength={500} placeholder={t('sell.aiNotesPlaceholder')} onChangeText={setNotes} />
        <View style={styles.inline}>
          <Button variant="secondary" size="small" icon={<Icon name={SPARKLES} color={colors.text} size={16} />} loading={busy === 'ai'} disabled={!markets.ai || (busy !== null && busy !== 'ai')} onPress={() => void askAi()}>
            {t('sell.useAi')}
          </Button>
        </View>
        {!markets.ai && <Text style={[styles.muted, font('regular')]}>{t('sell.aiUnavailable')}</Text>}
        {askReplace && (
          <SystemBanner
            tone="info"
            title={t('sell.replaceTitle')}
            message={t('sell.replaceBody')}
            action={
              <View style={styles.inline}>
                <Button variant="secondary" size="small" onPress={() => take(askReplace, true)}>
                  {t('sell.replace')}
                </Button>
                <Button variant="text" size="small" onPress={() => take(askReplace, false)}>
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
      </View>

      <TextInput label={t('sell.formTitle')} value={form.title} maxLength={80} hint={t('sell.charCount', { count: form.title.length, max: 80 })} onChangeText={(title) => edit({ title })} />
      <View style={styles.block}>
        <Text style={[styles.label, font('semibold')]}>{t('sell.formCondition')}</Text>
        <ChipBar label={t('sell.formCondition')} chips={listingConditionOptions(t)} value={form.condition ?? ('' as never)} onChange={(condition) => edit({ condition })} />
      </View>
      <TextInput label={t('sell.formPrice')} kind="money" currency={currency} value={form.price} error={priceError} onChangeText={(price) => edit({ price })} />
      <TextInput label={t('sell.formDescription')} value={form.description} maxLength={4000} multiline numberOfLines={6} textAlignVertical="top" onChangeText={(description) => edit({ description })} />

      <View style={styles.block}>
        {form.itemSpecifics.length > 0 && <Text style={[styles.label, font('semibold')]}>{t('sell.itemDetails')}</Text>}
        {form.itemSpecifics.map((s, i) => (
          <View key={i} style={styles.specific}>
            <View style={styles.flex}>
              <TextInput label={t('sell.detailName')} value={s.name} maxLength={40} onChangeText={(name) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, name } : x)) })} />
            </View>
            <View style={styles.flex}>
              <TextInput label={t('sell.detailValue')} value={s.value} maxLength={80} onChangeText={(value) => edit({ itemSpecifics: form.itemSpecifics.map((x, j) => (j === i ? { ...x, value } : x)) })} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.name ? t('sell.removeNamed', { name: s.name }) : t('sell.removeDetail')}
              onPress={() => edit({ itemSpecifics: form.itemSpecifics.filter((_, j) => j !== i) })}
              hitSlop={6}
              style={({ pressed }) => [styles.removeDetail, pressed && styles.pressed]}
            >
              <Icon name={icons.close} color={colors.textMuted} size={16} />
            </Pressable>
          </View>
        ))}
        <AddRow label={t('sell.addDetail')} onPress={() => edit({ itemSpecifics: [...form.itemSpecifics, { name: '', value: '' }] })} />
      </View>

      <Section title={t('sell.whereToList')}>
        <ChipBar
          multiple
          label={t('sell.marketplaces')}
          chips={markets.items.map((m) => ({ value: m.marketplace, label: m.label, icon: <MarketplaceMark marketplace={m.marketplace} size={16} /> }))}
          value={chosen}
          onChange={setChosen}
        />
        {markets.items.map((m) => (
          <Text key={m.marketplace} style={[styles.muted, font('regular')]}>
            {t('sell.channelLine', { name: m.label, label: m.note })}
          </Text>
        ))}
        {listing.missing.length > 0 && <SystemBanner tone="info" title={t('sell.beforePublish')} message={listing.missing.join(' · ')} />}
      </Section>

      {listing.channels.length > 0 && (
        <Section title={t('sell.whereListed')}>
          {listing.channels.map((c, i) => {
            const v = channelView(c, localeTag, t);
            return (
              <View key={c.marketplace} style={[styles.channel, i < listing.channels.length - 1 && styles.hairline]}>
                <View style={styles.channelHead}>
                  <MarketplaceName marketplace={c.marketplace} size={18} textStyle={[styles.channelName, font('semibold')]} />
                  <Badge tone={v.tone}>{v.label}</Badge>
                </View>
                {v.detail && <Text style={[styles.muted, font('regular')]}>{v.detail}</Text>}
                {c.url && (
                  <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(c.url!)} hitSlop={6} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
                    <Text style={[styles.link, font('medium')]}>{t('sell.openListing')}</Text>
                  </Pressable>
                )}
                {v.awaiting && c.assist && (
                  <View style={styles.block}>
                    <Text selectable style={[styles.assist, font('regular')]}>
                      {c.assist.text}
                    </Text>
                    <View style={styles.inline}>
                      <Button variant="secondary" size="small" onPress={() => void Clipboard.setStringAsync(c.assist!.text).then(() => setNotice(t('sell.copied', { name: v.name })))}>
                        {t('sell.copyText')}
                      </Button>
                      <Button variant="secondary" size="small" icon={<MarketplaceMark marketplace={c.marketplace} size={14} />} onPress={() => void Linking.openURL(c.assist!.openUrl)}>
                        {t('sell.openMarketplace', { name: v.name })}
                      </Button>
                    </View>
                    <TextInput label={t('sell.postedLink')} value={postedUrl} autoCapitalize="none" onChangeText={setPostedUrl} />
                    <View style={styles.inline}>
                      <Button loading={busy === `confirm-${c.marketplace}`} onPress={() => void act(`confirm-${c.marketplace}`, () => api.confirmSellChannel(listing.id, c.marketplace, postedUrl.trim() || undefined), t('sell.markedPosted'))}>
                        {t('sell.posted')}
                      </Button>
                    </View>
                  </View>
                )}
                {v.canEnd && (
                  <View style={styles.inline}>
                    <Button variant="text" size="small" loading={busy === `end-${c.marketplace}`} onPress={() => void act(`end-${c.marketplace}`, () => api.endSellChannel(listing.id, c.marketplace), t('sell.takenDown', { name: v.name }))}>
                      {c.mode === 'assisted' ? t('sell.tookDown') : t('sell.takeDown')}
                    </Button>
                  </View>
                )}
              </View>
            );
          })}
        </Section>
      )}
    </Screen>
  );
}

/** "Take photos" / "Choose from library" at the end of the photo strip. */
function AddTile({ icon, label, disabled, busy, onPress }: { icon: IconName; label: string; disabled: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.addTile, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} color={colors.text} size={24} />
      <Text style={[styles.addTileText, font('medium')]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: type.headline },
  label: { color: colors.text, fontSize: type.subhead },
  muted: { color: colors.textMuted, fontSize: type.footnote, lineHeight: 17 },
  notice: { color: colors.text, fontSize: type.callout },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  // Edge to edge: the strip scrolls under the screen gutter.
  strip: { marginHorizontal: -GUTTER, flexGrow: 0 },
  stripRow: { gap: space[2], paddingHorizontal: GUTTER, paddingTop: 6 },
  tile: { width: TILE, gap: 4 },
  coverBadge: { position: 'absolute', left: 6, bottom: 6 },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  tileAction: { minHeight: 24, justifyContent: 'center' },
  tileActionText: { color: colors.text, fontSize: type.footnote, textDecorationLine: 'underline' },
  addTile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  addTileText: { color: colors.text, fontSize: type.caption, textAlign: 'center' },
  sourceTile: { width: 72 },
  sourceAdd: { position: 'absolute', right: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.background },
  sourceAddText: { color: colors.text, fontSize: type.caption },
  ai: { gap: space[3], padding: 14, borderRadius: radius.md, backgroundColor: colors.grouped },
  specific: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  removeDetail: { width: 36, height: 48, alignItems: 'center', justifyContent: 'center' },
  channel: { gap: space[2], paddingVertical: space[3] },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  channelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  channelName: { color: colors.text, fontSize: type.body },
  linkRow: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: colors.text, fontSize: type.callout, textDecorationLine: 'underline' },
  assist: { color: colors.text, fontSize: type.subhead, padding: space[3], borderRadius: radius.sm, backgroundColor: colors.grouped },
});
