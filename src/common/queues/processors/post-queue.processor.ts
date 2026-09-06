import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueNames } from '../queues.constants';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../redis/services/redis.service';

@Processor(QueueNames.POST)
export class PostQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(PostQueueProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'process_post') {
      const { postId } = job.data;
      this.logger.log(`Starting background post-processing for post: ${postId}`);

      try {
        // 1. Fetch post from DB
        const post = await this.prisma.post.findUnique({
          where: { id: BigInt(postId) },
        });

        if (!post) {
          this.logger.warn(`Post ${postId} not found in DB. Aborting processing.`);
          return;
        }

        // 2. Perform mock processing (e.g. content/image safety scan)
        this.logger.log(`Performing content moderation and image analysis for post: ${postId}`);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate async processing

        // 3. Cache warm-up / update cache details
        const cacheKey = `post:details:${postId}`;
        const serialized = {
          ...post,
          id: post.id.toString(),
          userId: post.userId,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          deletedAt: post.deletedAt,
        };

        // Cache the fully processed post details for fast reads
        await this.redisService.set(cacheKey, serialized, {
          ttl: 86400, // 24 hours
          jitter: true,
        });

        this.logger.log(`Successfully completed post-processing for post: ${postId}`);
      } catch (error: any) {
        this.logger.error(`Failed to process post ${postId}: ${error.message}`, error.stack);
        throw error;
      }
    }
  }
}
