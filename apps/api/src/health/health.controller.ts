import { Controller, Get, Inject, Logger } from '@nestjs/common';
import type { HealthResponse } from '@rein-drop/contracts';
import { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../database/database.module.js';

const DB_CHECK_TIMEOUT_MS = 2000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const databaseUp = await this.isDatabaseUp();
    return {
      status: databaseUp ? 'ok' : 'degraded',
      service: 'api',
      timestamp: new Date().toISOString(),
      database: databaseUp ? 'up' : 'down',
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
