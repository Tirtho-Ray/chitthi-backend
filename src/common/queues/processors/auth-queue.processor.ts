import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueNames } from '../queues.constants';
import { Logger } from '@nestjs/common';

@Processor(QueueNames.AUTH)
export class AuthQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthQueueProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.log(`Processed auth queue job: ${job.name}`);
  }
}
