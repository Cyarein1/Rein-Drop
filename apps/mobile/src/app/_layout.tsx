import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AccessProvider } from '@/access/AccessProvider';
import { SessionProvider } from '@/auth/SessionProvider';
import { CapabilitiesProvider } from '@/capabilities/CapabilitiesProvider';
import { NotificationsBridge } from '@/notifications/NotificationsBridge';
import { headerOptions, sheetOptions } from '@/navigation/options';
import { useT } from '@/i18n/useT';
import { interFonts, setInterLoaded } from '@/ui';

// Catch rendering errors anywhere in the navigation tree.
export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  // Keeps a back button when the app is opened directly on a stack screen (e.g. a deep link).
  initialRouteName: '(tabs)',
};

// Keep the native splash until fonts are ready, so text never re-flows on first paint.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(interFonts);
  // Never block the app on fonts: fall back to the system font if Inter fails to load.
  const ready = fontsLoaded || !!fontError;
  setInterLoaded(fontsLoaded);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    // Swipeable rows need the gesture root at the top of the tree.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <CapabilitiesProvider>
          <AccessProvider>
            <NotificationsBridge />
            <RootStack />
            <StatusBar style="dark" />
          </AccessProvider>
        </CapabilitiesProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

/** Screen titles in the UI language (inside the session, so the account's language applies). */
function RootStack() {
  const t = useT();
  return (
    <Stack screenOptions={headerOptions()}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: t('nav.titleAccount') }} />
      <Stack.Screen name="onboarding" options={{ title: t('nav.titleOnboarding'), presentation: 'modal' }} />
      {/* Create / Edit Hunt: one question per screen with their own top bar (step 89). */}
      <Stack.Screen name="hunts/new" options={{ title: t('nav.createHunt'), presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="hunts/[id]/index" options={{ title: t('nav.titleHunt') }} />
      <Stack.Screen name="hunts/[id]/edit" options={{ title: t('nav.titleEditHunt'), headerShown: false }} />
      <Stack.Screen name="hunts/[id]/start" options={{ title: t('nav.titleStartWatching'), presentation: 'modal' }} />
      {/* Deal detail draws its own photo header with floating back / share / save buttons. */}
      <Stack.Screen name="deals/[id]/index" options={{ title: t('nav.titleDeal'), headerShown: false }} />
      <Stack.Screen name="deals/[id]/bought" options={sheetOptions([0.7, 0.95])} />
      <Stack.Screen name="deals/[id]/dismiss" options={sheetOptions([0.6, 0.9])} />
      <Stack.Screen name="inventory/[id]/index" options={{ title: t('nav.titleInventoryItem') }} />
      <Stack.Screen name="inventory/[id]/sell" options={sheetOptions([0.95])} />
      <Stack.Screen name="inventory/[id]/result" options={{ title: t('nav.titleSaleResult') }} />
      <Stack.Screen name="sell/index" options={{ title: t('nav.titleListings') }} />
      <Stack.Screen name="sell/[id]" options={{ title: t('nav.titleListForSale') }} />
      <Stack.Screen name="alerts" options={{ title: t('nav.titleInbox') }} />
      {/* Developer-only screen: English. */}
      <Stack.Screen name="dev" options={{ title: 'Developer' }} />
    </Stack>
  );
}
