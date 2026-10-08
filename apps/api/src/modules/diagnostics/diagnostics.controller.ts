import { Controller, Get, HttpStatus, Inject, Query } from '@nestjs/common';
import { ingestionDiagnosticsQuerySchema, type IngestionDiagnostics } from '@rein-drop/contracts';
import { AppException } from '../../common/errors/app.exception.js';
import { createZodDto } from '../../common/validation/zod-validation.pipe.js';
import { API_CONFIG, type ApiConfig } from '../../config/api-config.js';
import { DiagnosticsService } from './diagnostics.service.js';

class IngestionDiagnosticsQueryDto extends createZodDto(ingestionDiagnosticsQuerySchema) {}

/**
 * DEVELOPMENT ONLY: ingestion economics and freshness across every user's Hunts - not customer
 * analytics. Responds 404 in production as if the route did not exist. Still requires sign-in.
 */
@Controller('dev/diagnostics')
export class DevDiagnosticsController {
  constructor(
    private readonly diagnostics: DiagnosticsService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  /** Per marketplace/provider: requests, listings, duplicates, candidates, analyses, alerts, latency, listing age, cost. */
  @Get('ingestion')
  async ingestion(@Query() query: IngestionDiagnosticsQueryDto): Promise<IngestionDiagnostics> {
    if (this.config.nodeEnv === 'production') {
      throw new AppException('NOT_FOUND', 'Cannot GET /dev/diagnostics/ingestion', HttpStatus.NOT_FOUND);
    }
    return this.diagnostics.ingestion(query);
  }
}
