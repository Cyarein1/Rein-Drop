import { act, render } from '@testing-library/react-native';
import { NotificationsBridge } from '../NotificationsBridge';

/**
 * Push taps and foreground display (step 84) with a fake expo-notifications, router and session:
 * deep link to the deal, cold start handled once and cleared, taps waiting for sign-in, malformed
 * payloads -> inbox, duplicate / on-screen alerts not shown again, token rotation re-registers.
 */
const DEAL = '01990000-0000-7000-8000-0000000000aa';
const ALERT = '01990000-0000-7000-8000-0000000000bb';

const mockPush = jest.fn();
let mockPath = '/deals';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPath }));

let mockSession: { status: string; session?: { user: { userId: string } } } = { status: 'authenticated', session: { user: { userId: 'u1' } } };
jest.mock('@/auth/SessionProvider', () => ({ useSessionState: () => ({ state: mockSession }) }));

const mockMarkRead = jest.fn(() => Promise.resolve());
jest.mock('@/config/api', () => ({ getApiClient: () => ({ markAlertRead: mockMarkRead }) }));

const mockRefresh = jest.fn(() => Promise.resolve({ status: 'enabled' }));
jest.mock('../push', () => ({ refreshPushRegistration: (...args: unknown[]) => mockRefresh(...(args as [])) }));

type Listener = (r: unknown) => void;
const mockN = {
  handler: null as null | { handleNotification: (n: unknown) => Promise<{ shouldShowBanner: boolean }> },
  onTap: null as null | Listener,
  onToken: null as null | (() => void),
  last: null as unknown,
  cleared: 0,
};
jest.mock('../load-notifications', () => ({
  loadNotifications: () => ({
    setNotificationHandler: (h: typeof mockN.handler) => (mockN.handler = h),
    getLastNotificationResponseAsync: async () => mockN.last,
    clearLastNotificationResponseAsync: async () => void (mockN.cleared += 1),
    addNotificationResponseReceivedListener: (l: Listener) => ((mockN.onTap = l), { remove: () => undefined }),
    addPushTokenListener: (l: () => void) => ((mockN.onToken = l), { remove: () => undefined }),
  }),
}));

const response = (id: string, data: unknown) => ({ notification: { request: { identifier: id, content: { data } } } });
const notification = (data: unknown) => ({ request: { identifier: 'x', content: { data } } });
const flush = () => act(async () => await new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { status: 'authenticated', session: { user: { userId: 'u1' } } };
  mockPath = '/deals';
  mockN.last = null;
  mockN.cleared = 0;
});

describe('NotificationsBridge', () => {
  it('tapping a deal alert opens that deal and marks the alert read', async () => {
    render(<NotificationsBridge />);
    await flush();
    act(() => mockN.onTap!(response('n1', { alertId: ALERT, dealId: DEAL, category: 'deal_alerts' })));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/deals/[id]', params: { id: DEAL } });
    expect(mockMarkRead).toHaveBeenCalledWith(ALERT);
  });

  it('cold start: opens the tapped deal once, then clears it so a later launch does not replay it', async () => {
    mockN.last = response('cold', { dealId: DEAL });
    render(<NotificationsBridge />);
    await flush();
    act(() => mockN.onTap!(response('cold', { dealId: DEAL })));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockN.cleared).toBe(1);
  });

  it('malformed or missing ids open the inbox instead', async () => {
    render(<NotificationsBridge />);
    await flush();
    act(() => mockN.onTap!(response('n2', { dealId: '../settings' })));
    expect(mockPush).toHaveBeenCalledWith('/alerts');
  });

  it('a tap while signed out (session expired) waits and opens after sign-in', async () => {
    mockSession = { status: 'unauthenticated' };
    const view = render(<NotificationsBridge />);
    await flush();
    act(() => mockN.onTap!(response('n3', { dealId: DEAL })));
    expect(mockPush).not.toHaveBeenCalled();
    mockSession = { status: 'authenticated', session: { user: { userId: 'u1' } } };
    view.rerender(<NotificationsBridge />);
    await flush();
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/deals/[id]', params: { id: DEAL } });
  });

  it('foreground: shows an alert once; not again for a duplicate, nor for the deal already on screen', async () => {
    render(<NotificationsBridge />);
    await flush();
    const show = async (data: unknown) => (await mockN.handler!.handleNotification(notification(data))).shouldShowBanner;
    expect(await show({ alertId: ALERT, dealId: DEAL })).toBe(true);
    expect(await show({ alertId: ALERT, dealId: DEAL })).toBe(false);
    mockPath = `/deals/${DEAL}`;
    const view = render(<NotificationsBridge />);
    await flush();
    expect(await show({ alertId: '01990000-0000-7000-8000-0000000000cc', dealId: DEAL })).toBe(false);
    view.unmount();
  });

  it('registers on sign-in, and again when the OS rotates the push token', async () => {
    render(<NotificationsBridge />);
    await flush();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    act(() => mockN.onToken!());
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });
});
