import { Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config.js';
import { CLOCK, JOB_QUEUE, type Clock, type JobQueue } from '../queue/job-queue.js';
import { JobRunner } from '../queue/job-runner.js';
import { PostgresJobQueue } from '../queue/postgres-job-queue.js';
import { HuntScheduler } from './hunt-scheduler.js';
import { createWorkerMarketplaceRegistry } from './marketplace-registry.js';
import { MarketplaceSearchHandler } from './marketplace-search.handler.js';
import { PipelineService } from './pipeline.service.js';
import { SEARCH_QUEUE } from './search-plan.js';

export const PRISMA = Symbol('PRISMA');

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}
  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}

/**
 * Scheduler + queue + runner + marketplace search. Swapping the queue for Azure means replacing
 * the JOB_QUEUE provider only.
 */
@Module({
  providers: [
    { provide: CLOCK, useValue: (() => new Date()) satisfies Clock },
    { provide: PRISMA, inject: [WORKER_CONFIG], useFactory: (c: WorkerConfig) => createPrismaClient(c.databaseUrl) },
    PrismaLifecycle,
    { provide: MarketplaceRegistry, inject: [WORKER_CONFIG], useFactory: createWorkerMarketplaceRegistry },
    { provide: JOB_QUEUE, inject: [PRISMA, CLOCK], useFactory: (p: PrismaClient, clock: Clock) => new PostgresJobQueue(p, clock) },
    {
      provide: HuntScheduler,
      inject: [PRISMA, JOB_QUEUE, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, q: JobQueue, c: WorkerConfig, clock: Clock) =>
        new HuntScheduler(p, q, { pollIntervalMs: c.pipeline.pollIntervalMs, maxAttempts: c.pipeline.maxAttempts, batchSize: 200 }, clock),
    },
    {
      provide: MarketplaceSearchHandler,
      inject: [PRISMA, MarketplaceRegistry, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, r: MarketplaceRegistry, c: WorkerConfig, clock: Clock) =>
        new MarketplaceSearchHandler(p, r, { maxPages: c.pipeline.searchMaxPages }, clock),
    },
    {
      provide: JobRunner,
      inject: [JOB_QUEUE, MarketplaceSearchHandler, WORKER_CONFIG, CLOCK],
      useFactory: (q: JobQueue, search: MarketplaceSearchHandler, c: WorkerConfig, clock: Clock) =>
        new JobRunner(q, [search], { queue: SEARCH_QUEUE, maxJobs: c.pipeline.jobsPerTick, leaseMs: c.pipeline.leaseMs }, clock),
    },
    PipelineService,
  ],
})
export class PipelineModule {}
