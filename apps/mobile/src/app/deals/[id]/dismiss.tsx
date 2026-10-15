import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AccessibilityInfo, ScrollView, StyleSheet } from 'react-native';
import { ApiError } from '@rein-drop/api-client';
import { buildIgnoreRequest, IGNORE_REASON_MAX } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { getApiClient } from '@/config/api';
import { useT } from '@/i18n/useT';
import { Button, GUTTER, haptic, SheetHeader, SystemBanner, TextInput } from '@/ui';

/**
 * "Not for me" sheet: an optional reason (it helps tune the Hunt), then Ignore this deal. Closes
 * back to the deal, which reloads; Undo ignore is offered there.
 */
export default function DismissSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT();
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const built = buildIgnoreRequest(reason, t);
    if (!built.ok) return setFieldError(built.error);
    setFieldError(undefined);
    setPending(true);
    setError(null);
    try {
      await getApiClient().ignoreDeal(id, built.request);
      haptic.success();
      AccessibilityInfo.announceForAccessibility(t('deals.doneIgnored'));
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
      <SheetHeader title={t('deals.notForMe')} onCancel={() => router.back()} />
      <TextInput
        label={t('deals.ignoreLabel')}
        value={reason}
        onChangeText={setReason}
        maxLength={IGNORE_REASON_MAX}
        hint={t('deals.ignoreHint')}
        error={fieldError}
        onSubmitEditing={() => void submit()}
        returnKeyType="done"
        autoFocus
      />
      {error && <SystemBanner tone="error" title={t('errors.actionFailed')} message={error} />}
      <Button size="large" loading={pending} onPress={() => void submit()}>
        {t('deals.ignoreSubmit')}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: GUTTER, paddingTop: space[2], paddingBottom: space[8], gap: space[4] },
});
