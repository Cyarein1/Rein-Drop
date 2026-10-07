import { InMemoryJobQueue } from './in-memory-job-queue.js';
import { describeJobQueueContract } from './job-queue.contract.js';

describeJobQueueContract('in-memory', async () => {
  let offset = 0;
  return {
    queue: new InMemoryJobQueue(() => new Date(Date.now() + offset)),
    queueName: 'contract',
    advance: (ms) => (offset += ms),
  };
});
