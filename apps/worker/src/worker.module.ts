import { DynamicModule, Module } from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from './config/worker-config.js';
import { HeartbeatService } from './heartbeat.service.js';

// TODO(worker): job runner / scheduler abstraction. The queue choice
// (local abstraction first, Azure Storage Queue vs Service Bus later) is TBD.
@Module({})
export class WorkerModule {
  /** Config is validated before Nest starts (see main.ts) and provided globally. */
  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: WorkerModule,
      global: true,
      providers: [{ provide: WORKER_CONFIG, useValue: config }, HeartbeatService],
      exports: [WORKER_CONFIG],
    };
  }
}
