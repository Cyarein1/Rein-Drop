import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import type { HealthResponse, ReadinessResponse } from '@rein-drop/contracts';
import { PrismaClient } from '@rein-drop/db';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { PRISMA } from '../database/database.module.js';

const DB_CHECK_TIMEOUT_MS = 2000;

/** Health probes are public: they must work without credentials (load balancers, uptime checks). */
@Public()
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Liveness: the process is up and serving. Checks no dependencies. */
  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'api', timestamp: new Date().toISOString() };
  }

  /** Readiness: dependencies are reachable. 503 with the same body when not. */
  @Get('ready')
  async getReady(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const database = (await this.isDatabaseUp()) ? 'up' : 'down';
    const ready = database === 'up';
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { database },
      timestamp: new Date().toISOString(),
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${DB_CHECK_TIMEOUT_MS}ms`)),
            DB_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return true;
    } catch (err) {
      this.logger.warn(`Database check failed: ${describeError(err)}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Prisma connection errors carry the useful part in `code` (e.g. ECONNREFUSED) and a
 * multi-line message that starts with a newline, so log "code - first message line".
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as { code?: unknown }).code;
  const firstLine = err.message.trim().split('\n')[0];
  return [typeof code === 'string' ? code : '', firstLine].filter(Boolean).join(' - ') || err.name;
}
