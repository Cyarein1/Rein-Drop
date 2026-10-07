import { Controller, Get } from '@nestjs/common';
import type { Plan } from '@rein-drop/contracts';
import { PlansService } from './plans.service.js';

/** Plans for the plan gate. Requires sign-in (global AuthGuard). */
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  async list(): Promise<{ items: Plan[] }> {
    return { items: await this.plans.list() };
  }
}
