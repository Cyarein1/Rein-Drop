import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { FeatureKey } from '@rein-drop/api-client';
import TabsLayout from '../../app/(tabs)/_layout';
import StartRedirect from '../../app/(tabs)/index';
import CreateRedirect from '../../app/(tabs)/create';
import NotFound from '../../app/+not-found';

/**
 * Companion navigation (decision 0018, PLATFORM_FEATURE_MATRIX.md): the REAL tabs layout and
 * redirect routes, with stub screens. Session gating and the onboarding prompt are covered
 * elsewhere, so they are switched off here.
 */
jest.mock('@/auth/SessionGate', () => ({ SessionGate: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/onboarding/useOnboardingPrompt', () => ({ useOnboardingPrompt: () => undefined }));

let mockUnavailable: FeatureKey[] = [];
jest.mock('@/capabilities/CapabilitiesProvider', () => {
  const caps = () => {
    const { capabilitiesFor: mockCapabilitiesFor } = jest.requireActual<typeof import('@rein-drop/api-client')>('@rein-drop/api-client');
    const all = mockCapabilitiesFor({ platform: 'mobile', flags: [], entitlements: null, environment: 'production' });
    for (const key of mockUnavailable) all[key] = { ...all[key], available: false, reason: 'not_entitled' };
    return all;
  };
  return { useCapabilities: caps, useCan: (f: FeatureKey) => caps()[f].available };
});

const stub = (name: string) => {
  const Screen = () => <Text>{`${name} screen`}</Text>;
  Screen.displayName = `${name}Stub`;
  return Screen;
};
const routes = () => ({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StartRedirect,
  '(tabs)/create': CreateRedirect,
  '(tabs)/deals': stub('Deals'),
  '(tabs)/hunts': stub('Hunts'),
  '(tabs)/inventory': stub('Inventory'),
  '(tabs)/account': stub('Account'),
  '+not-found': NotFound,
  'hunts/new': stub('Create Hunt'),
  'deals/[id]': stub('Deal detail'),
  alerts: stub('Inbox'),
});

beforeEach(() => {
  mockUnavailable = [];
});

describe('companion navigation', () => {
  it('opens on Deals; the tab bar is Deals, Hunts, Inventory, Account in that order', () => {
    const router = renderRouter(routes(), { initialUrl: '/' });
    expect(router.getPathname()).toBe('/deals');
    expect(screen.getByText('Deals screen')).toBeOnTheScreen();
    const labels = ['Deals', 'Hunts', 'Inventory', 'Account'];
    const tabs = screen.getAllByRole('button').filter((b) => labels.some((l) => (b.props.accessibilityLabel ?? '').startsWith(l)));
    expect(tabs.map((t) => labels.find((l) => (t.props.accessibilityLabel as string).startsWith(l)))).toEqual(labels);
  });

  it('switches tabs from the tab bar', () => {
    const router = renderRouter(routes(), { initialUrl: '/deals' });
    fireEvent.press(screen.getByRole('button', { name: /^Hunts/ }));
    expect(router.getPathname()).toBe('/hunts');
    expect(screen.getByText('Hunts screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Account/ }));
    expect(router.getPathname()).toBe('/account');
  });

  it('header shortcut: the inbox from Deals', () => {
    const router = renderRouter(routes(), { initialUrl: '/deals' });
    fireEvent.press(screen.getByLabelText('Inbox'));
    expect(router.getPathname()).toBe('/alerts');
  });

  it('header shortcut: Create Hunt from Hunts', () => {
    const router = renderRouter(routes(), { initialUrl: '/hunts' });
    fireEvent.press(screen.getByLabelText('Create Hunt'));
    expect(router.getPathname()).toBe('/hunts/new');
  });

  it.each(['/analytics', '/analytics/missed', '/settings/billing', '/home'])('web-only or unknown route %s lands on Deals (never a dead end)', (url) => {
    const router = renderRouter(routes(), { initialUrl: url });
    expect(router.getPathname()).toBe('/deals');
  });

  it('old link /create opens Create Hunt', () => {
    const router = renderRouter(routes(), { initialUrl: '/create' });
    expect(router.getPathname()).toBe('/hunts/new');
  });

  it('a notification deep link opens the deal', () => {
    const router = renderRouter(routes(), { initialUrl: '/deals/0199-deal' });
    expect(router.getPathname()).toBe('/deals/0199-deal');
    expect(screen.getByText('Deal detail screen')).toBeOnTheScreen();
  });

  it('a tab whose feature is not available is not shown (e.g. no Inventory)', () => {
    mockUnavailable = ['inventory'];
    renderRouter(routes(), { initialUrl: '/deals' });
    expect(screen.queryByRole('button', { name: /^Inventory/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Hunts/ })).toBeOnTheScreen();
  });
});
