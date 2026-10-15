import { Stack } from 'expo-router';
import { SessionGate } from '@/auth/SessionGate';
import { AreaSettings } from '@/geo/AreaSettings';
import { useT } from '@/i18n/useT';
import { Screen } from '@/ui';

/** Account > Your area (decision 0017): a suburb, town or postal code, offered as one tap in Create Hunt. */
export default function AreaScreen() {
  return (
    <SessionGate>
      <Area />
    </SessionGate>
  );
}

function Area() {
  const t = useT();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('account.areaTitle') }} />
      <AreaSettings />
    </Screen>
  );
}
