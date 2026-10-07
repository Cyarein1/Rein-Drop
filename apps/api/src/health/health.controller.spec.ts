import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { PRISMA } from '../database/database.module.js';
import { HealthController } from './health.controller.js';

async function createController(queryRaw: () => Promise<unknown>) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PRISMA, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  return module.get<HealthController>(HealthController);
}

function fakeResponse() {
  const res = { statusCode: 0, status: vi.fn((code: number) => ((res.statusCode = code), res)) };
  return res as typeof res & Response;
}

describe('HealthController', () => {
  it('/health is ok without touching the database', async () => {
    const queryRaw = vi.fn(() => Promise.reject(new Error('should not be called')));
    const controller = await createController(queryRaw);
    const result = controller.getHealth();
    expect(result).toMatchObject({ status: 'ok', service: 'api' });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('/ready is ready (200) when the database answers', async () => {
    const controller = await createController(() => Promise.resolve([{ '?column?': 1 }]));
    const res = fakeResponse();
    await expect(controller.getReady(res)).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'up' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('/ready is not_ready (503) when the database is down', async () => {
    const controller = await createController(() => Promise.reject(new Error('ECONNREFUSED')));
    const res = fakeResponse();
    await expect(controller.getReady(res)).resolves.toMatchObject({
      status: 'not_ready',
      checks: { database: 'down' },
    });
    expect(res.statusCode).toBe(503);
  });
});
