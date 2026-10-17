import { useState } from 'react';
import { useRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { accountDeletionText, deletionConfirmed } from '@rein-drop/client-core';
import { space } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useSessionState } from '@/auth/SessionProvider';
import { getApiClient } from '@/config/api';
import { apiMessage } from '@/data/useInventoryItem';
import { useT } from '@/i18n/useT';
import { ActionBar, Button, colors, font, haptic, Screen, SystemBanner, TextInput, type } from '@/ui';

/**
 * Delete account (decision 0021; Apple 5.1.1(v), Google Play, GDPR): reachable in the app from
 * Account. Says what is erased, asks the person to type DELETE, then POST /me/delete and signs out
 * on this phone (the signed-out screen says the account was deleted). Companion wording: the
 * billing paragraph is replaced by a neutral "your access ends" line (decision 0018).
 */
export default function DeleteAccountScreen() {
  return (
    <SessionGate>
      <DeleteAccount />
    </SessionGate>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const t = useT();
  const { accountDeleted } = useSessionState();
  const text = accountDeletionText(t);
  // [what happens, what goes, billing (web only), signing in again] - billing swapped for access.
  const paragraphs = [text.paragraphs[0], text.paragraphs[1], t('account.deleteAccessEnds'), text.paragraphs[3]].filter((p): p is string => !!p);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = deletionConfirmed(typed);

  const remove = async () => {
    if (!confirmed || pending) return;
    setPending(true);
    setError(null);
    AccessibilityInfo.announceForAccessibility(text.progress);
    try {
      await getApiClient().deleteAccount();
      haptic.success();
      AccessibilityInfo.announceForAccessibility(text.done);
      // Back to the tabs, which now show the signed-out screen ("Your account was deleted").
      if (router.canDismiss()) router.dismissAll();
      await accountDeleted();
    } catch (err) {
      setError(t('account.deleteFailed', { message: apiMessage(err) }));
      setPending(false);
    }
  };

  return (
    <Screen
      footer={
        <ActionBar stacked>
          {error && <SystemBanner tone="error" title={error} />}
          <Button variant="destructive" size="large" loading={pending} disabled={!confirmed} onPress={() => void remove()}>
            {pending ? text.progress : text.confirmLabel}
          </Button>
          <Button variant="text" size="large" disabled={pending} onPress={() => router.back()}>
            {text.cancelLabel}
          </Button>
        </ActionBar>
      }
    >
      <View style={styles.block}>
        {paragraphs.map((p) => (
          <Text key={p} style={[styles.body, font('regular')]}>
            {p}
          </Text>
        ))}
      </View>
      <TextInput
        label={text.typeToConfirm}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        editable={!pending}
        onSubmitEditing={() => void remove()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space[3] },
  body: { color: colors.text, fontSize: type.callout, lineHeight: 21 },
});
