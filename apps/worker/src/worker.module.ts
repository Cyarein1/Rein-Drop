import { DynamicModule, Module } from '@nestjs/common';
import { WORKER_CONFIG, type WorkerConfig } from './config/worker-config.js';
import { HeartbeatService } from './heartbeat.service.js';
import { PipelineModule } from './pipeline/pipeline.module.js';

@Module({})
export class WorkerModule {
  /** Config is validated before Nest starts (see main.ts) and provided globally. */
  static forRoot(config: WorkerConfig): DynamicModule {
    return {
      module: WorkerModule,
      global: true,
      imports: [PipelineModule],
      providers: [{ provide: WORKER_CONFIG, useValue: config }, HeartbeatService],
      exports: [WORKER_CONFIG],
    };
  }
}
