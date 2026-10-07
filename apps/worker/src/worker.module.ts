import { Module } from '@nestjs/common';
import { HeartbeatService } from './heartbeat.service.js';

// TODO(worker): job runner / scheduler abstraction. The queue choice
// (local abstraction first, Azure Storage Queue vs Service Bus later) is TBD.
@Module({
  providers: [HeartbeatService],
})
export class WorkerModule {}
