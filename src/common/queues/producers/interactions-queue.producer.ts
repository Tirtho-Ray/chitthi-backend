import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from '../queues.constants';
import { InteractionJobPayload, InteractionJobType } from '../types/interactions.type';

@Injectable()
export class InteractionQueueProducer {
  constructor(
    @InjectQueue(QueueNames.INTERACTIONS) private readonly interactionsQueue: Queue,
  ) {}

  async enqueue(payload: InteractionJobPayload) {
    const keyParts = [payload.type, payload.postId, payload.commentId, payload.userId].filter(Boolean);
    await this.interactionsQueue.add('interaction_event', payload, {
      jobId: keyParts.join(':'),
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1500,
      },
    });
  }

  async postLiked(userId: string, postId: string) {
    return this.enqueue({ type: InteractionJobType.POST_LIKED, userId, postId });
  }

  async postUnliked(userId: string, postId: string) {
    return this.enqueue({ type: InteractionJobType.POST_UNLIKED, userId, postId });
  }

  async commentCreated(userId: string, postId: string, commentId: string) {
    return this.enqueue({ type: InteractionJobType.COMMENT_CREATED, userId, postId, commentId });
  }

  async replyCreated(userId: string, postId: string, commentId: string, parentCommentId: string) {
    return this.enqueue({
      type: InteractionJobType.REPLY_CREATED,
      userId,
      postId,
      commentId,
      parentCommentId,
    });
  }

  async commentLiked(userId: string, commentId: string) {
    return this.enqueue({ type: InteractionJobType.COMMENT_LIKED, userId, commentId });
  }

  async commentUnliked(userId: string, commentId: string) {
    return this.enqueue({ type: InteractionJobType.COMMENT_UNLIKED, userId, commentId });
  }
}
