import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from './config/worker-config.js';

/** Logs periodically that the worker process is alive (the pipeline logs its own activity). */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(@Inject(WORKER_CONFIG) private readonly config: WorkerConfig) {}

  onApplicationBootstrap() {
    this.logger.log(`Heartbeat every ${this.config.heartbeatMs}ms`);
    this.timer = setInterval(() => this.logger.log('Heartbeat'), this.config.heartbeatMs);
  }

  onApplicationShutdown(signal?: string) {
    if (this.timer) clearInterval(this.timer);
    this.logger.log(`Shutting down${signal ? ` (${signal})` : ''}`);
  }
}
