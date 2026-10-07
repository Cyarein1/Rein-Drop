import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '@/auth/SessionProvider';
import { headerOptions } from '@/navigation/options';
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
    <SessionProvider>
      <Stack screenOptions={headerOptions()}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="onboarding" options={{ title: 'Set up Rein Drop', presentation: 'modal' }} />
        <Stack.Screen name="hunts/new" options={{ title: 'Create Hunt', presentation: 'modal' }} />
        <Stack.Screen name="hunts/[id]/start" options={{ title: 'Start watching', presentation: 'modal' }} />
        <Stack.Screen name="dev" options={{ title: 'Developer' }} />
      </Stack>
      <StatusBar style="dark" />
    </SessionProvider>
  );
}
