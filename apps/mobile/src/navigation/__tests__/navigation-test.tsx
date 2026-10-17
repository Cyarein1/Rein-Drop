import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import type { FeatureKey } from '@rein-drop/api-client';
import TabsLayout from '../../app/(tabs)/_layout';
import StartRedirect from '../../app/(tabs)/index';
import CreateRedirect from '../../app/(tabs)/create';
import NotFound from '../../app/+not-found';
import SellListingsRedirect from '../../app/sell/index';
import { InboxHeaderButton } from '../options';

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
const DealsStub = () => (
  <>
    <Text>Deals screen</Text>
    <InboxHeaderButton unread={2} />
  </>
);
// The Sell tab keeps the shared key / route "inventory" (decision 0021); it shows the section it was opened on.
const SellStub = () => {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return <Text>{`Sell screen ${section ?? 'holding'}`}</Text>;
};
const routes = () => ({
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': StartRedirect,
  '(tabs)/create': CreateRedirect,
  // Tab screens draw their own header (LargeTitleHeader): the Deals stub carries its inbox button.
  '(tabs)/deals': DealsStub,
  '(tabs)/hunts': stub('Hunts'),
  '(tabs)/inventory': SellStub,
  '(tabs)/account': stub('Account'),
  '+not-found': NotFound,
  'hunts/new': stub('Create Hunt'),
  'deals/[id]/index': stub('Deal detail'),
  alerts: stub('Inbox'),
  'sell/index': SellListingsRedirect,
  'inventory/[id]/index': stub('Item'),
  'sell/[id]/index': stub('Listing editor'),
});

beforeEach(() => {
  mockUnavailable = [];
});

describe('companion navigation', () => {
  it('opens on Deals; the tab bar is Deals, Hunts, central Create, Sell, Account in that order', () => {
    const router = renderRouter(routes(), { initialUrl: '/' });
    expect(router.getPathname()).toBe('/deals');
    expect(screen.getByText('Deals screen')).toBeOnTheScreen();
    const labels = ['Deals', 'Hunts', 'Create Hunt', 'Sell', 'Account'];
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

  it.each(['/deals', '/hunts', '/inventory', '/account'])('the central + opens Create Hunt from %s', (url) => {
    const router = renderRouter(routes(), { initialUrl: url });
    fireEvent.press(screen.getByRole('button', { name: 'Create Hunt' }));
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

  it('Sell tab (decision 0021): the tab key stays inventory and opens the Sell area', () => {
    const router = renderRouter(routes(), { initialUrl: '/deals' });
    fireEvent.press(screen.getByRole('button', { name: /^Sell/ }));
    expect(router.getPathname()).toBe('/inventory');
    expect(screen.getByText('Sell screen holding')).toBeOnTheScreen();
  });

  it('old link /sell (Your listings) opens the Sell tab on Listings', () => {
    const router = renderRouter(routes(), { initialUrl: '/sell' });
    expect(router.getPathname()).toBe('/inventory');
    expect(screen.getByText('Sell screen listed')).toBeOnTheScreen();
  });

  it.each([
    ['/inventory/0199-item', 'Item screen'],
    ['/sell/0199-listing', 'Listing editor screen'],
  ])('old deep link %s still opens its page', (url, text) => {
    const router = renderRouter(routes(), { initialUrl: url });
    expect(router.getPathname()).toBe(url);
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('a tab whose feature is not available is not shown (e.g. no Sell / inventory)', () => {
    mockUnavailable = ['inventory'];
    renderRouter(routes(), { initialUrl: '/deals' });
    expect(screen.queryByRole('button', { name: /^Sell/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Hunts/ })).toBeOnTheScreen();
  });
});
