import { HttpStatus, Logger, RequestMethod } from '@nestjs/common';
import { joinWaitlistRequestSchema } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import type { ApiConfig } from '../../config/api-config.js';
import { IS_PUBLIC } from '../../auth/decorators.js';
import { WAITLIST_API_LIMIT, WaitlistController } from './waitlist.controller.js';
import { WaitlistService } from './waitlist.service.js';

const EMAIL = 'private.person@example.com';
const request = joinWaitlistRequestSchema.parse({
  email: ` ${EMAIL.toUpperCase()} `,
  source: 'landing_waitlist_form',
  requestedMarketplaces: ['offerup', 'other'],
  requestedMarketplaceOther: 'Kijiji',
  consentVersion: '2026-10-12',
});

function setup(count: number, logFormat: ApiConfig['logFormat'] = 'json') {
  const createMany = vi.fn().mockResolvedValue({ count });
  const prisma = { waitlistSignup: { createMany } } as unknown as PrismaClient;
  const service = new WaitlistService(prisma, { logFormat } as ApiConfig);
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  return { service, createMany, log };
}

afterEach(() => vi.restoreAllMocks());

describe('WaitlistService', () => {
  it('stores the normalized sign-up once, skipping duplicates at the database', async () => {
    const { service, createMany } = setup(1);
    await expect(service.join(request, 'req-1')).resolves.toBe('created');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          email: EMAIL,
          source: 'landing_waitlist_form',
          requestedMarketplaces: ['offerup', 'other'],
          requestedMarketplaceOther: 'Kijiji',
          consentVersion: '2026-10-12',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('a repeat address is a quiet no-op (no error, nothing overwritten)', async () => {
    const { service } = setup(0);
    await expect(service.join(request, 'req-2')).resolves.toBe('duplicate');
  });

  it.each(['json', 'text'] as const)('logs the outcome without the email (%s logs)', async (format) => {
    const { service, log } = setup(1, format);
    await service.join(request, 'req-3');
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('created');
    expect(logged).toContain('req-3');
    expect(logged.toLowerCase()).not.toContain('private.person');
    expect(logged).not.toContain('Kijiji');
  });

  it('a database failure propagates (the exception filter returns a generic 500, never the input)', async () => {
    const prisma = { waitlistSignup: { createMany: vi.fn().mockRejectedValue(new Error('connection refused')) } } as unknown as PrismaClient;
    const service = new WaitlistService(prisma, { logFormat: 'json' } as ApiConfig);
    await expect(service.join(request, undefined)).rejects.toThrow('connection refused');
  });
});

describe('WaitlistController', () => {
  it('answers the same for new and repeat addresses', async () => {
    for (const outcome of ['created', 'duplicate'] as const) {
      const controller = new WaitlistController({ join: vi.fn().mockResolvedValue(outcome) } as unknown as WaitlistService);
      await expect(controller.join(request, {} as never)).resolves.toEqual({ status: 'received' });
    }
  });

  it('is a public POST /waitlist with 202 and a throttle ceiling', () => {
    const handler = WaitlistController.prototype.join;
    expect(Reflect.getMetadata('path', WaitlistController)).toBe('waitlist');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(HttpStatus.ACCEPTED);
    expect(Reflect.getMetadata(IS_PUBLIC, handler)).toBe(true);
    expect(WAITLIST_API_LIMIT.default.limit).toBeGreaterThan(0);
  });
});
