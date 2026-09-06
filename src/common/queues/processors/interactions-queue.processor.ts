import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RedisService } from '../../redis/services/redis.service';
import { QueueNames } from '../queues.constants';
import { InteractionJobPayload, InteractionJobType } from '../types/interactions.type';

@Processor(QueueNames.INTERACTIONS)
export class InteractionQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(InteractionQueueProcessor.name);

  constructor(private readonly redisService: RedisService) {
    super();
  }

  async process(job: Job<InteractionJobPayload>): Promise<void> {
    const { type, postId, commentId, parentCommentId, userId } = job.data;

    const keysToDelete = new Set<string>();
    if (postId) {
      keysToDelete.add('post:details:' + postId);
      keysToDelete.add('post:comments:' + postId);
    }
    if (commentId) {
      keysToDelete.add('comment:details:' + commentId);
      keysToDelete.add('comment:replies:' + commentId);
    }
    if (parentCommentId) {
      keysToDelete.add('comment:replies:' + parentCommentId);
    }

    if (keysToDelete.size > 0) {
      await this.redisService.mDel([...keysToDelete]);
    }

    this.logger.log('Processed interaction event ' + type + ' for user ' + userId);

    if (type === InteractionJobType.COMMENT_CREATED || type === InteractionJobType.REPLY_CREATED) {
      this.logger.log('Cache invalidated after comment write for post ' + postId);
    }
  }
}
