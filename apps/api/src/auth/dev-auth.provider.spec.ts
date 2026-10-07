import { DEV_AUTH_HEADER, DEV_AUTH_SUBJECT } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { AppException } from '../common/errors/app.exception.js';
import { DevAuthProvider } from './dev-auth.provider.js';

const USER = { id: '01990000-0000-7000-8000-000000000001', email: 'dev@reindrop.local', displayName: null };

function provider(findUnique: (...args: unknown[]) => Promise<unknown> = async () => USER) {
  const prisma = { user: { findUnique: vi.fn(findUnique) } } as unknown as PrismaClient;
  return { provider: new DevAuthProvider(prisma, 'development'), prisma };
}

const request = (headers: Record<string, string> = {}, remoteAddress = '127.0.0.1') => ({ headers, remoteAddress });

describe('DevAuthProvider', () => {
  it('can never be constructed in production', () => {
    const prisma = {} as PrismaClient;
    expect(() => new DevAuthProvider(prisma, 'production')).toThrow(/development-only/);

    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new DevAuthProvider(prisma, 'development')).toThrow(/development-only/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('authenticates the seeded user from a local/private address', async () => {
    const { provider: p, prisma } = provider();
    const result = await p.authenticate(request({ [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT }, '::ffff:192.168.0.20'));
    expect(result).toEqual({
      status: 'authenticated',
      principal: { userId: USER.id, email: USER.email, displayName: null, provider: 'dev', subject: DEV_AUTH_SUBJECT },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authProvider_authSubject: { authProvider: 'dev', authSubject: DEV_AUTH_SUBJECT } },
      }),
    );
  });

  it('refuses public addresses before looking anything up', async () => {
    const { provider: p, prisma } = provider();
    const result = await p.authenticate(request({ [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT }, '8.8.8.8'));
    expect(result.status).toBe('forbidden');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('is anonymous without a valid subject or a seeded user', async () => {
    expect((await provider().provider.authenticate(request())).status).toBe('anonymous');
    expect((await provider().provider.authenticate(request({ [DEV_AUTH_HEADER]: 'Robert"); DROP' }))).status).toBe(
      'anonymous',
    );
    const missing = await provider(async () => null).provider.authenticate(request({ [DEV_AUTH_HEADER]: 'nobody' }));
    expect(missing).toMatchObject({ status: 'anonymous', reason: expect.stringMatching(/pnpm db:seed/) });
  });

  it('reports 503 (not a crash) when the database is down', async () => {
    const { provider: p } = provider(async () => {
      throw new Error('ECONNREFUSED');
    });
    const err = await p.authenticate(request({ [DEV_AUTH_HEADER]: DEV_AUTH_SUBJECT })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect(err).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
