import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from '../config/worker-config.js';
import { JobRunner } from '../queue/job-runner.js';
import { ANALYSIS_RUNNER } from './deal-analysis.handler.js';
import { HuntScheduler } from './hunt-scheduler.js';

/**
 * Drives the pipeline in this process: a scheduler tick (due hunts -> jobs) and a runner tick
 * (jobs -> searches). Each loop never overlaps itself; shutdown waits for in-flight work.
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
  ) {}

  onApplicationBootstrap() {
    const { schedulerIntervalMs, runnerIntervalMs, pollIntervalMs } = this.config.pipeline;
    this.logger.log(
      `Pipeline started: scheduler every ${schedulerIntervalMs}ms, runner every ${runnerIntervalMs}ms, hunts polled every ${pollIntervalMs / 60_000} min`,
    );
    this.timers = [
      this.loop('scheduler', schedulerIntervalMs, async () => {
        const s = await this.scheduler.scheduleDue();
        if (s.claimed > 0) this.logger.log(`Scheduled ${s.claimed} hunt-marketplace(s): ${s.enqueued} job(s), ${s.duplicates} duplicate(s), ${s.failed} failed`);
      }),
      this.loop('runner', runnerIntervalMs, async () => {
        const r = await this.runner.runOnce();
        if (r.received > 0) this.logger.log(`Ran ${r.received} job(s): ${JSON.stringify(r.outcomes)}`);
      }),
      this.loop('analysis', runnerIntervalMs, async () => {
        const r = await this.analysisRunner.runOnce();
        if (r.received > 0) this.logger.log(`Analysed ${r.received} match(es): ${JSON.stringify(r.outcomes)}`);
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
