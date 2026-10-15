import AccountScreen from '@/screens/AccountScreen';

/**
 * `/settings` - the Account screen as a standalone route (title in the stack header). Not behind
 * the session gate: signed-out people reach sign-in and connection help here (SessionGate's "Open
 * Settings"). Signed-in people use the Account tab, which renders the same screen.
 */
export default function SettingsScreen() {
  return <AccountScreen />;
}
