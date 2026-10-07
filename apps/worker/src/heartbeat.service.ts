import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

const DEFAULT_HEARTBEAT_MS = 60_000;

/** Keeps the worker process alive and logs that it is healthy. No jobs yet. */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer?: NodeJS.Timeout;

  onApplicationBootstrap() {
    const intervalMs = parseIntervalMs(process.env.WORKER_HEARTBEAT_MS);
    this.logger.log(`Idle - heartbeat every ${intervalMs}ms`);
    this.timer = setInterval(() => this.logger.log('Heartbeat'), intervalMs);
  }

  onApplicationShutdown(signal?: string) {
    if (this.timer) clearInterval(this.timer);
    this.logger.log(`Shutting down${signal ? ` (${signal})` : ''}`);
  }
}

function parseIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_HEARTBEAT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1000) {
    throw new Error(`WORKER_HEARTBEAT_MS must be an integer >= 1000, got "${raw}"`);
  }
  return value;
}
