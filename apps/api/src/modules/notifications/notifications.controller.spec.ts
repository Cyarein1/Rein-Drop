import { loadApiConfig } from '../../config/api-config.js';
import { DevNotificationsController } from './notifications.controller.js';
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
