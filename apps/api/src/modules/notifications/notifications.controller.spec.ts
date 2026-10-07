import { loadApiConfig } from '../../config/api-config.js';
import { DevNotificationsController, PushDevicesController } from './notifications.controller.js';
import type { NotificationsService } from './notifications.service.js';

describe('DevNotificationsController', () => {
  const service = { deliveryLog: vi.fn(async () => ({ items: [] })) } as unknown as NotificationsService;
  const user = { userId: '01990000-0000-7000-8000-000000000001', email: 'dev@reindrop.local' } as never;

  it('serves the simulator log outside production', async () => {
    await expect(new DevNotificationsController(service, loadApiConfig({ NODE_ENV: 'test' })).log(user)).resolves.toEqual({ items: [] });
  });

  it('is 404 in production, without touching the database', async () => {
    const calls = vi.mocked(service.deliveryLog).mock.calls.length;
    const prod = { ...loadApiConfig({ NODE_ENV: 'test' }), nodeEnv: 'production' } as ReturnType<typeof loadApiConfig>;
    await expect(new DevNotificationsController(service, prod).log(user)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(vi.mocked(service.deliveryLog).mock.calls.length).toBe(calls);
  });
});

describe('PushDevicesController', () => {
  const user = { userId: '01990000-0000-7000-8000-000000000001', email: 'dev@reindrop.local' } as never;
  const devToken = { provider: 'dev_simulated' as const, token: 'dev-simulated:0199a000-0000-7000-8000-000000000001', platform: 'android' as const };

  it('refuses development push tokens in production, without touching the database', async () => {
    const service = { registerDevice: vi.fn() } as unknown as NotificationsService;
    const prod = { ...loadApiConfig({ NODE_ENV: 'test' }), nodeEnv: 'production' } as ReturnType<typeof loadApiConfig>;
    await expect(new PushDevicesController(service, prod).register(user, devToken)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(service.registerDevice).not.toHaveBeenCalled();
  });

  it('accepts them in development', async () => {
    const service = { registerDevice: vi.fn(async () => ({ id: 'd' })) } as unknown as NotificationsService;
    await expect(new PushDevicesController(service, loadApiConfig({ NODE_ENV: 'test' })).register(user, devToken)).resolves.toEqual({ id: 'd' });
  });
});
