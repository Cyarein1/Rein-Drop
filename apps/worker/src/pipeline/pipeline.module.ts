import { Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { createAIProvider, type AIProvider } from '@rein-drop/ai-core';
import { createPrismaClient, type PrismaClient } from '@rein-drop/db';
import { createGeocodingProvider } from '@rein-drop/geo';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { DEFAULT_SCORING_POLICY } from '@rein-drop/scoring';
import { createProductEventProvider, ProductEvents } from '@rein-drop/telemetry';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config.js';
import { CLOCK, JOB_QUEUE, type Clock, type JobQueue } from '../queue/job-queue.js';
import { JobRunner } from '../queue/job-runner.js';
import { PostgresJobQueue } from '../queue/postgres-job-queue.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import { createNotificationSenders } from '../notifications/senders.js';
import { ANALYSIS_QUEUE, ANALYSIS_RUNNER, DealAnalysisHandler } from './deal-analysis.handler.js';
import { SourceHealthStore } from '../health/source-health.store.js';
import { HuntScheduler } from './hunt-scheduler.js';
import { createWorkerMarketplaceRegistry } from './marketplace-registry.js';
import { ListingPlaces } from './listing-places.js';
import { MarketplaceSearchHandler } from './marketplace-search.handler.js';
import { PipelineService } from './pipeline.service.js';
import { SEARCH_QUEUE } from './search-plan.js';

export const PRISMA = Symbol('PRISMA');
export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const PRODUCT_EVENTS = Symbol('PRODUCT_EVENTS');

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PRODUCT_EVENTS) private readonly events: ProductEvents,
  ) {}
  async onApplicationShutdown() {
    await this.events.shutdown();
    await this.prisma.$disconnect();
  }
}

/** Product events recorded by the worker (deal_alerted). Same provider choice as the API. */
function createProductEvents(c: WorkerConfig): ProductEvents {
  const logger = new Logger('ProductEvents');
  const provider = createProductEventProvider(c.productEvents, (entry) => logger.log(entry), c.logFormat);
  return new ProductEvents(provider, { source: 'worker', onProblem: (message) => logger.warn(message) });
}

/**
 * Scheduler + queue + runners + marketplace search + deal analysis + notification outbox. Swapping the queue for Azure
 * means replacing the JOB_QUEUE provider only.
 */
@Module({
  providers: [
    { provide: CLOCK, useValue: (() => new Date()) satisfies Clock },
    { provide: PRISMA, inject: [WORKER_CONFIG], useFactory: (c: WorkerConfig) => createPrismaClient(c.databaseUrl) },
    { provide: PRODUCT_EVENTS, inject: [WORKER_CONFIG], useFactory: createProductEvents },
    PrismaLifecycle,
    { provide: MarketplaceRegistry, inject: [WORKER_CONFIG], useFactory: createWorkerMarketplaceRegistry },
    // Fails at startup when the configured provider isn't available (e.g. foundry: NOT_CONFIGURED).
    { provide: AI_PROVIDER, inject: [WORKER_CONFIG], useFactory: (c: WorkerConfig) => createAIProvider(c.ai.provider, c.ai.foundry) },
    { provide: JOB_QUEUE, inject: [PRISMA, CLOCK], useFactory: (p: PrismaClient, clock: Clock) => new PostgresJobQueue(p, clock) },
    {
      provide: HuntScheduler,
      inject: [PRISMA, JOB_QUEUE, WORKER_CONFIG, SourceHealthStore, CLOCK],
      useFactory: (p: PrismaClient, q: JobQueue, c: WorkerConfig, health: SourceHealthStore, clock: Clock) =>
        new HuntScheduler(p, q, { pollIntervalMs: c.pipeline.pollIntervalMs, maxAttempts: c.pipeline.maxAttempts, batchSize: 200, health }, clock),
    },
    {
      provide: SourceHealthStore,
      inject: [PRISMA, WORKER_CONFIG, CLOCK],
      useFactory: (p: PrismaClient, c: WorkerConfig, clock: Clock) => new SourceHealthStore(p, c.sourceHealth, clock),
    },
    {
      provide: MarketplaceSearchHandler,
      inject: [PRISMA, MarketplaceRegistry, JOB_QUEUE, WORKER_CONFIG, SourceHealthStore, CLOCK],
      useFactory: (p: PrismaClient, r: MarketplaceRegistry, q: JobQueue, c: WorkerConfig, health: SourceHealthStore, clock: Clock) =>
        new MarketplaceSearchHandler(
          p,
          r,
          {
            maxPages: c.pipeline.searchMaxPages,
            analysis: { queue: q, queueName: ANALYSIS_QUEUE, maxAttempts: c.pipeline.maxAttempts },
            health,
            searchTimeoutMs: c.pipeline.searchTimeoutMs,
            // Distance checks (decision 0017): listing places via the cache; `none` = unchecked.
            places: new ListingPlaces(p, createGeocodingProvider(c.geo), clock),
          },
          clock,
        ),
    },
    {
      provide: DealAnalysisHandler,
      inject: [PRISMA, AI_PROVIDER, MarketplaceRegistry, CLOCK, PRODUCT_EVENTS],
      useFactory: (p: PrismaClient, ai: AIProvider, r: MarketplaceRegistry, clock: Clock, events: ProductEvents) =>
        new DealAnalysisHandler(p, ai, r, DEFAULT_SCORING_POLICY, clock, events),
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
          createNotificationSenders(p, { nodeEnv: c.nodeEnv, delivery: c.notifications.delivery, push: c.notifications.push }),
          { batchSize: 20, leaseMs: c.pipeline.leaseMs, maxAttempts: c.pipeline.maxAttempts },
          clock,
        ),
    },
    PipelineService,
  ],
})
export class PipelineModule {}
