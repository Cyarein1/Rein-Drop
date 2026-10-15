import type { ReactNode } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MOBILE_TABS } from '@rein-drop/api-client';
import { fontSize, radius, roles, size } from '@rein-drop/design-tokens';
import { useCanUseHunts } from '@/access/AccessNotice';
import { SessionGate } from '@/auth/SessionGate';
import { useCapabilities } from '@/capabilities/CapabilitiesProvider';
import { headerOptions, InboxHeaderButton, ListingsHeaderButton, NavIcon } from '@/navigation/options';
import { useOnboardingPrompt } from '@/onboarding/useOnboardingPrompt';
import { font } from '@/ui';

/**
 * Companion navigation (decision 0018): Deals - Hunts - central "+" Create - Inventory - Account,
 * in the order and availability of the shared MOBILE_TABS / platform capabilities. The "+" is not
 * a destination: it opens Create Hunt on top of the current tab (hidden while the account is
 * suspended). The inbox opens from Deals. Home and Analytics are web-only: `/` and `/create`
 * redirect, retired routes fall back to Deals (+not-found). All tabs require a session.
 */
export default function TabsLayout() {
  return (
    <SessionGate>
      <AppTabs />
    </SessionGate>
  );
}

type TabName = (typeof MOBILE_TABS)[number]['name'];
type IconName = Parameters<typeof NavIcon>[0]['name'];
const ICONS: Record<Exclude<TabName, 'create'>, IconName> = {
  deals: { ios: 'tag', android: 'sell' },
  hunts: { ios: 'scope', android: 'radar' },
  inventory: { ios: 'shippingbox', android: 'inventory_2' },
  account: { ios: 'person.crop.circle', android: 'account_circle' },
};
const HEADER_RIGHT: Partial<Record<TabName, () => ReactNode>> = {
  deals: () => <InboxHeaderButton />,
  // Your listings (Sell, decision 0019) - only when the Sell workspace is available.
  inventory: () => <SellHeaderButton />,
};

function AppTabs() {
  const caps = useCapabilities();
  const canUseHunts = useCanUseHunts();
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
      {MOBILE_TABS.map((tab) =>
        tab.name === 'create' ? (
          <Tabs.Screen
            key={tab.name}
            name="create"
            options={{
              title: 'Create Hunt',
              href: caps[tab.feature].available && canUseHunts ? undefined : null,
              tabBarButton: (props) => <CreateTabButton style={props.style} />,
            }}
          />
        ) : (
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
        ),
      )}
      {/* Redirect-only route, never in the bar. */}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

function SellHeaderButton() {
  return useCapabilities()['sell.workspace'].available ? <ListingsHeaderButton /> : null;
}

/** The central "+": opens the Create Hunt modal over the current tab (Mobile UI Screenbook). */
function CreateTabButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create Hunt"
      onPress={() => router.push('/hunts/new')}
      style={({ pressed }) => [style, styles.createButton, pressed && styles.pressed]}
    >
      <View style={styles.createCircle}>
        <NavIcon name={{ ios: 'plus', android: 'add' }} color={roles.onAction} size={26} />
      </View>
      <Text style={[styles.createLabel, font('semibold')]}>Create</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  createButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: size.touchTarget },
  createCircle: {
    width: 44,
    height: 44,
    marginTop: -14,
    borderRadius: radius.full,
    backgroundColor: roles.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: { color: roles.text, fontSize: fontSize.xs, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
