import type { ReactNode } from 'react';
import { Tabs } from 'expo-router';
import { MOBILE_TABS } from '@rein-drop/api-client';
import { fontSize, roles } from '@rein-drop/design-tokens';
import { SessionGate } from '@/auth/SessionGate';
import { useCapabilities } from '@/capabilities/CapabilitiesProvider';
import { CreateHuntHeaderButton, headerOptions, InboxHeaderButton, NavIcon } from '@/navigation/options';
import { useOnboardingPrompt } from '@/onboarding/useOnboardingPrompt';
import { font } from '@/ui';

/**
 * Companion navigation (decision 0018): Deals - Hunts - Inventory - Account, in the order and
 * availability of the shared MOBILE_TABS / platform capabilities. The inbox opens from Deals and
 * Create Hunt from Hunts. Home and Analytics are web-only: `/` and `/create` redirect, retired
 * routes fall back to Deals (+not-found). All tabs require a session.
 */
export default function TabsLayout() {
  return (
    <SessionGate>
      <AppTabs />
    </SessionGate>
  );
}

type IconName = Parameters<typeof NavIcon>[0]['name'];
const ICONS: Record<(typeof MOBILE_TABS)[number]['name'], IconName> = {
  deals: { ios: 'tag', android: 'sell' },
  hunts: { ios: 'scope', android: 'radar' },
  inventory: { ios: 'shippingbox', android: 'inventory_2' },
  account: { ios: 'person.crop.circle', android: 'account_circle' },
};
const HEADER_RIGHT: Partial<Record<(typeof MOBILE_TABS)[number]['name'], () => ReactNode>> = {
  deals: () => <InboxHeaderButton />,
  hunts: () => <CreateHuntHeaderButton />,
};

function AppTabs() {
  const caps = useCapabilities();
  useOnboardingPrompt();
  return (
    <Tabs
      initialRouteName="deals"
      screenOptions={{
        ...headerOptions(),
        tabBarActiveTintColor: roles.text,
        tabBarInactiveTintColor: roles.textMuted,
        tabBarStyle: { backgroundColor: roles.background, borderTopColor: roles.border },
        tabBarLabelStyle: { ...font('semibold'), fontSize: fontSize.xs },
      }}
    >
      {MOBILE_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            // A tab whose feature isn't available isn't shown (and can't be navigated to from the bar).
            href: caps[tab.feature].available ? undefined : null,
            headerRight: HEADER_RIGHT[tab.name],
            tabBarIcon: ({ color }) => <NavIcon name={ICONS[tab.name]} color={color} />,
          }}
        />
      ))}
      {/* Redirect-only routes, never in the bar. */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="create" options={{ href: null }} />
    </Tabs>
  );
}
