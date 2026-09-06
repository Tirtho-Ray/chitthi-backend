import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../queues.constants';

@Injectable()
export class PostQueueProducer {
  constructor(
    @InjectQueue(QueueNames.POST) private readonly postQueue: Queue,
  ) {}

  async addPostProcessingJob(data: { postId: string }) {
    await this.postQueue.add('process_post', data, {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }
}
