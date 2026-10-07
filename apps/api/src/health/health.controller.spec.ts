import { Test, TestingModule } from '@nestjs/testing';
import { PRISMA } from '../database/database.module.js';
import { HealthController } from './health.controller.js';

async function createController(queryRaw: () => Promise<unknown>) {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PRISMA, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  return module.get<HealthController>(HealthController);
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const controller = await createController(() => Promise.resolve([{ '?column?': 1 }]));
    const result = await controller.getHealth();
    expect(result).toMatchObject({ status: 'ok', service: 'api', database: 'up' });
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('reports degraded (not an error) when the database is down', async () => {
    const controller = await createController(() => Promise.reject(new Error('ECONNREFUSED')));
    await expect(controller.getHealth()).resolves.toMatchObject({
      status: 'degraded',
      database: 'down',
    });
  });
});
