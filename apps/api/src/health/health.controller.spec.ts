import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok with an ISO timestamp', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('api');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
