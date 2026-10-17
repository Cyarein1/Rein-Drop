import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MOBILE_TABS } from '@rein-drop/api-client';
import type { MessageKey } from '@rein-drop/i18n';
import { radius, roles, size } from '@rein-drop/design-tokens';
import { useCanUseHunts } from '@/access/AccessNotice';
import { SessionGate } from '@/auth/SessionGate';
import { useCapabilities } from '@/capabilities/CapabilitiesProvider';
import { useT } from '@/i18n/useT';
import { NavIcon } from '@/navigation/options';
import { useOnboardingPrompt } from '@/onboarding/useOnboardingPrompt';
import { font } from '@/ui';

/**
 * Companion navigation (decision 0018): Deals - Hunts - central "+" Create - Sell - Account,
 * in the order and availability of the shared MOBILE_TABS / platform capabilities. The "+" is not
 * a destination: it opens Create Hunt on top of the current tab (hidden while the account is
 * suspended). The inbox opens from Deals. Home and Analytics are web-only: `/` and `/create`
 * redirect, retired routes fall back to Deals (+not-found). All tabs require a session.
 * Sell (decision 0021): Inventory merged into Sell - the tab keeps the shared key and route
 * `inventory` (old /inventory links keep working) and shows the title / icon of the Sell area.
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
  inventory: { ios: 'storefront', android: 'storefront' },
  account: { ios: 'person.crop.circle', android: 'account_circle' },
};
const TAB_TITLE: Record<Exclude<TabName, 'create'>, MessageKey> = {
  deals: 'nav.tabDeals',
  hunts: 'nav.tabHunts',
  inventory: 'nav.tabSell',
  account: 'nav.tabAccount',
};
function AppTabs() {
  const caps = useCapabilities();
  const canUseHunts = useCanUseHunts();
  const t = useT();
  useOnboardingPrompt();
  return (
    <Tabs
      initialRouteName="deals"
      screenOptions={{
        // Tab screens draw their own LargeTitleHeader (title + header buttons inside the gutter).
        headerShown: false,
        tabBarActiveTintColor: roles.text,
        tabBarInactiveTintColor: roles.textMuted,
        tabBarStyle: { backgroundColor: roles.background, borderTopColor: roles.border, borderTopWidth: StyleSheet.hairlineWidth },
        tabBarLabelStyle: { ...font('medium'), fontSize: 11 },
      }}
    >
      {MOBILE_TABS.map((tab) =>
        tab.name === 'create' ? (
          <Tabs.Screen
            key={tab.name}
            name="create"
            options={{
              title: t('nav.createHunt'),
              href: caps[tab.feature].available && canUseHunts ? undefined : null,
              tabBarButton: (props) => <CreateTabButton style={props.style} />,
            }}
          />
        ) : (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: t(TAB_TITLE[tab.name]),
              // A tab whose feature isn't available isn't shown (and can't be navigated to from the bar).
              href: caps[tab.feature].available ? undefined : null,
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

/** The central "+": opens the Create Hunt modal over the current tab (Mobile UI Screenbook). */
function CreateTabButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.createHunt')}
      onPress={() => router.push('/hunts/new')}
      style={({ pressed }) => [style, styles.createButton, pressed && styles.pressed]}
    >
      <View style={styles.createCircle}>
        <NavIcon name={{ ios: 'plus', android: 'add' }} color={roles.onAction} size={26} />
      </View>
      <Text style={[styles.createLabel, font('semibold')]}>{t('nav.create')}</Text>
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
  createLabel: { color: roles.text, fontSize: 11, marginTop: 2 },
  pressed: { opacity: 0.8 },
});
