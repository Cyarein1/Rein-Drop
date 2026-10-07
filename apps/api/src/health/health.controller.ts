import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@rein-drop/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api', timestamp: new Date().toISOString() };
  }
}
