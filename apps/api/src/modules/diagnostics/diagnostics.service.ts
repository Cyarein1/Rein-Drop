import { Inject, Injectable } from '@nestjs/common';
import type { IngestionDiagnostics, IngestionDiagnosticsQuery } from '@rein-drop/contracts';
import type { PrismaClient } from '@rein-drop/db';
import { PRISMA } from '../../database/database.module.js';
import { toIngestionDiagnostics } from './diagnostics.mapper.js';
import { diagnosticsQueries, type DiagnosticsWindow } from './diagnostics.sql.js';

/** The window a query asks for: explicit since/until, or the last `hours` ending now. */
export function diagnosticsWindow(query: IngestionDiagnosticsQuery, now: Date): DiagnosticsWindow {
  if (query.since) return { since: new Date(query.since), until: query.until ? new Date(query.until) : now };
  return { since: new Date(now.getTime() - query.hours * 3_600_000), until: now };
}

/**
 * INTERNAL ingestion economics and freshness (decision 0011): system-wide, development only.
 * Aggregation happens in PostgreSQL (diagnostics.sql.ts); this only shapes rows.
 */
@Injectable()
export class DiagnosticsService {
  private readonly clock = () => new Date();

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async ingestion(query: IngestionDiagnosticsQuery): Promise<IngestionDiagnostics> {
    const now = this.clock();
    const w = diagnosticsWindow(query, now);
    const [runs, rejections, analyses, alerts, ages, hunts] = await diagnosticsQueries(this.prisma, w);
    return toIngestionDiagnostics({ runs, rejections, analyses, alerts, ages, hunts }, w, now);
  }
}
