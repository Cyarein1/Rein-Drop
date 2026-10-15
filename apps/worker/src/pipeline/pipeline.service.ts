import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config.js';
import { JobRunner } from '../queue/job-runner.js';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.js';
import { PushMaintenance } from '../notifications/push/push-maintenance.js';
import { ANALYSIS_RUNNER } from './deal-analysis.handler.js';
import { MarketplaceRegistry } from '@rein-drop/marketplace-core';
import { SourceHealthStore } from '../health/source-health.store.js';
import { HuntScheduler } from './hunt-scheduler.js';

/**
 * Drives the pipeline in this process: a scheduler tick (due hunts -> jobs), a search runner,
 * an analysis runner (deal scoring + alerts) and the notification outbox (push / email
 * deliveries). Each loop never overlaps itself; shutdown waits for in-flight work.
 * Several worker processes can run side by side - claiming and leasing are concurrency-safe.
 */
@Injectable()
export class PipelineService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PipelineService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly inFlight = new Set<Promise<unknown>>();
  private stopping = false;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    private readonly scheduler: HuntScheduler,
    private readonly runner: JobRunner,
    @Inject(ANALYSIS_RUNNER) private readonly analysisRunner: JobRunner,
    private readonly notifications: NotificationDispatcher,
    private readonly pushMaintenance: PushMaintenance,
    private readonly sourceHealth: SourceHealthStore,
    private readonly registry: MarketplaceRegistry,
  ) {}

  onApplicationBootstrap() {
    const { schedulerIntervalMs, runnerIntervalMs, pollIntervalMs } = this.config.pipeline;
    this.logger.log(
      `Pipeline started: scheduler every ${schedulerIntervalMs}ms, runner every ${runnerIntervalMs}ms, hunts polled every ${pollIntervalMs / 60_000} min`,
    );
    this.timers = [
      this.loop('scheduler', schedulerIntervalMs, async () => {
        const s = await this.scheduler.scheduleDue();
        if (s.claimed > 0 || s.deferred > 0) this.logger.log(`Scheduled ${s.claimed} hunt-marketplace(s): ${s.enqueued} job(s), ${s.duplicates} duplicate(s), ${s.failed} failed, ${s.deferred} waiting for a source cool-down`);
      }),
      this.loop('runner', runnerIntervalMs, async () => {
        const r = await this.runner.runOnce();
        if (r.received > 0) this.logger.log(`Ran ${r.received} job(s): ${JSON.stringify(r.outcomes)}`);
      }),
      this.loop('analysis', runnerIntervalMs, async () => {
        const r = await this.analysisRunner.runOnce();
        if (r.received > 0) this.logger.log(`Analysed ${r.received} match(es): ${JSON.stringify(r.outcomes)}`);
      }),
      this.loop('notifications', runnerIntervalMs, async () => {
        const n = await this.notifications.dispatchPending();
        if (n.claimed > 0) this.logger.log(`Notifications: ${JSON.stringify(n)}`);
      }),
      // Push receipts (dead tokens) and devices silent for too long - every 5 minutes.
      this.loop('push-maintenance', 5 * 60_000, async () => {
        const m = await this.pushMaintenance.run(new Date());
        if (m.checked + m.disabledByReceipt + m.disabledStale > 0) this.logger.log(`Push maintenance: ${JSON.stringify(m)}`);
      }),
      // Sources' own health checks: fills in when there were no searches lately, notices
      // "not configured", and lets a recovered source out of its cool-down early.
      this.loop('source-health', this.config.sourceHealth.probeIntervalMs, async () => {
        await this.sourceHealth.probe(this.registry, this.config.sourceHealth.probeIntervalMs);
      }),
    ];
  }

  async onApplicationShutdown() {
    this.stopping = true;
    this.timers.forEach(clearInterval);
    await Promise.allSettled(this.inFlight);
  }

  private loop(name: string, everyMs: number, tick: () => Promise<void>): NodeJS.Timeout {
    let running = false;
    const run = () => {
      if (running || this.stopping) return;
      running = true;
      const work = tick()
        .catch((err: unknown) => this.logger.error(`${name} tick failed: ${err instanceof Error ? err.message : String(err)}`))
        .finally(() => {
          running = false;
          this.inFlight.delete(work);
        });
      this.inFlight.add(work);
    };
    setImmediate(run);
    return setInterval(run, everyMs);
  }
}
