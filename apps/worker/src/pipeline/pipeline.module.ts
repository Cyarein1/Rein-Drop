import { Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { createAIProvider, type AIProvider } from '@rein-drop/ai-core';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DEFAULT_SCORING_POLICY } from '@rein-drop/scoring';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config.js';
import { CLOCK, JOB_QUEUE, type Clock, type JobQueue } from '../queue/job-queue.js';
import { JobRunner } from '../queue/job-runner.js';
import { PostgresJobQueue } from '../queue/postgres-job-queue.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import { createNotificationSenders } from '../notifications/senders.js';
import { ANALYSIS_QUEUE, ANALYSIS_RUNNER, DealAnalysisHandler } from './deal-analysis.handler.js';
import { HuntScheduler } from './hunt-scheduler.js';
import { createWorkerMarketplaceRegistry } from './marketplace-registry.js';
import { MarketplaceSearchHandler } from './marketplace-search.handler.js';
import { PipelineService } from './pipeline.service.js';
import { SEARCH_QUEUE } from './search-plan.js';

export const PRISMA = Symbol('PRISMA');
export const AI_PROVIDER = Symbol('AI_PROVIDER');

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}
  async onApplicationShutdown() {
    await this.prisma.$disconnect();
  }
}

/**
 * Scheduler + queue + runners + marketplace search + deal analysis + notification outbox. Swapping the queue for Azure
 * means replacing the JOB_QUEUE provider only.
 */
@Module({
  providers: [
    { provide: CLOCK, useValue: (() => new Date()) satisfies Clock },
    { provide: PRISMA, inject: [WORKER_CONFIG], useFactory: (c: WorkerConfig) => createPrismaClient(c.databaseUrl) },
    PrismaLifecycle,
    { provide: MarketplaceRegistry, inject: [WORKER_CONFIG], useFactory: createWorkerMarketplaceRegistry },
    // Fails at startup when the configured provider isn't available (e.g. foundry: NOT_CONFIGURED).
    { provide: AI_PROVIDER, inject: [WORKER_CONFIG], useFactory: (c: WorkerConfig) => createAIProvider(c.ai.provider) },
    { provide: JOB_QUEUE, inject: [PRISMA, CLOCK], useFactory: (p: PrismaClient, clock: Clock) => new PostgresJobQueue(p, clock) },
    {
      provide: HuntScheduler,
      inject: [PRISMA, JOB_QUEUE, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, q: JobQueue, c: WorkerConfig, clock: Clock) =>
        new HuntScheduler(p, q, { pollIntervalMs: c.pipeline.pollIntervalMs, maxAttempts: c.pipeline.maxAttempts, batchSize: 200 }, clock),
    },
    {
      provide: MarketplaceSearchHandler,
      inject: [PRISMA, MarketplaceRegistry, JOB_QUEUE, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, r: MarketplaceRegistry, q: JobQueue, c: WorkerConfig, clock: Clock) =>
        new MarketplaceSearchHandler(
          p,
          r,
          { maxPages: c.pipeline.searchMaxPages, analysis: { queue: q, queueName: ANALYSIS_QUEUE, maxAttempts: c.pipeline.maxAttempts } },
          clock,
        ),
    },
    {
      provide: DealAnalysisHandler,
      inject: [PRISMA, AI_PROVIDER, MarketplaceRegistry, CLOCK],
      useFactory: (p: PrismaClient, ai: AIProvider, r: MarketplaceRegistry, clock: Clock) =>
        new DealAnalysisHandler(p, ai, r, DEFAULT_SCORING_POLICY, clock),
    },
    {
      provide: JobRunner,
      inject: [JOB_QUEUE, MarketplaceSearchHandler, WORKER_CONFIG, CLOCK],
      useFactory: (q: JobQueue, search: MarketplaceSearchHandler, c: WorkerConfig, clock: Clock) =>
        new JobRunner(q, [search], { queue: SEARCH_QUEUE, maxJobs: c.pipeline.jobsPerTick, leaseMs: c.pipeline.leaseMs }, clock),
    },
    {
      provide: ANALYSIS_RUNNER,
      inject: [JOB_QUEUE, DealAnalysisHandler, WORKER_CONFIG, CLOCK],
      useFactory: (q: JobQueue, analysis: DealAnalysisHandler, c: WorkerConfig, clock: Clock) =>
        new JobRunner(q, [analysis], { queue: ANALYSIS_QUEUE, maxJobs: c.pipeline.jobsPerTick, leaseMs: c.pipeline.leaseMs }, clock),
    },
    {
      provide: NotificationDispatcher,
      inject: [PRISMA, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, c: WorkerConfig, clock: Clock) =>
        new NotificationDispatcher(
          p,
          createNotificationSenders(c.notifications.delivery),
          { batchSize: 20, leaseMs: c.pipeline.leaseMs, maxAttempts: c.pipeline.maxAttempts },
          clock,
        ),
    },
    PipelineService,
  ],
})
export class PipelineModule {}
