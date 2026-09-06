import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../common/redis/services/redis.service';
import { PostQueueProducer } from '../../../common/queues/producers/post-queue.producer';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { PostVisibility } from '@/prisma/generated/prisma/client';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly postQueueProducer: PostQueueProducer,
  ) {}

  /**
   * Serializes Post model fields, converting BigInt id to String for JSON safety.
   */
  private serializePost(post: any) {
    if (!post) return null;
    return {
      id: post.id.toString(),
      publicId: post.publicId,
      userId: post.userId.toString(),
      imageUrl: post.imageUrl,
      caption: post.caption,
      visibility: post.visibility,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      deletedAt: post.deletedAt,
    };
  }

  /**
   * Helper to construct fully qualified Redis keys respecting the configured prefix and cluster settings.
   */
  private getRedisKey(key: string): string {
    const prefix = (this.redisService as any)['prefix'] || 'myapp';
    const useCluster = (this.redisService as any)['useCluster'] || false;
    return useCluster ? `{${prefix}}:${key}` : `${prefix}:${key}`;
  }

  /**
   * Creates a post in the database, caches it, updates feed indexing, and triggers queue-based processing.
   */
  async createPost(userId: string, dto: CreatePostDto) {
    this.logger.log(`Creating post for user: ${userId}`);

    // 1. Create post in PostgreSQL
    const post = await this.prisma.post.create({
      data: {
        userId,
        imageUrl: dto.imageUrl,
        caption: dto.caption,
        visibility: dto.visibility || PostVisibility.PUBLIC,
      },
    });

    const serialized = this.serializePost(post);
    const postIdStr = post.id.toString();

    // 2. Cache individual post details
    const cacheKey = `post:details:${postIdStr}`;
    await this.redisService.set(cacheKey, serialized, {
      ttl: 86400, // 24 hours
      jitter: true,
    });

    // 3. Index in recent feed sorted set if PUBLIC
    if (post.visibility === PostVisibility.PUBLIC) {
      const feedKey = this.getRedisKey('posts:recent');
      await this.redisService.getClient().zadd(feedKey, post.createdAt.getTime(), postIdStr);
    }

    // 4. Enqueue background post-processing (e.g. content/image scanning)
    await this.postQueueProducer.addPostProcessingJob({ postId: postIdStr });

    return serialized;
  }

  /**
   * Updates visibility of a post, synchronizes caches and feed indexes.
   */
  async updateVisibility(userId: string, postId: string, visibility: PostVisibility) {
    this.logger.log(`Updating visibility of post ${postId} to ${visibility} by user ${userId}`);

    const id = BigInt(postId);

    // 1. Ownership & existence check
    const post = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!post || post.deletedAt) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('You are not authorized to update this post');
    }

    // 2. Update in PostgreSQL
    const updatedPost = await this.prisma.post.update({
      where: { id },
      data: { visibility },
    });

    const serialized = this.serializePost(updatedPost);

    // 3. Update individual details cache
    const cacheKey = `post:details:${postId}`;
    await this.redisService.set(cacheKey, serialized, {
      ttl: 86400,
      jitter: true,
    });

    // 4. Adjust sorted set indexing
    const feedKey = this.getRedisKey('posts:recent');
    const client = this.redisService.getClient();

    if (visibility === PostVisibility.PUBLIC) {
      await client.zadd(feedKey, updatedPost.createdAt.getTime(), postId);
    } else {
      await client.zrem(feedKey, postId);
    }

    return serialized;
  }

  /**
   * Retrieves paginated recent public feed using a fast Redis Sorted Set read path.
   */
  async getRecentFeed(page: number, limit: number) {
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    const feedKey = this.getRedisKey('posts:recent');
    const client = this.redisService.getClient();

    // 1. Check sorted set size to determine if feed needs warming
    const card = await client.zcard(feedKey);
    if (card === 0) {
      this.logger.log('Feed cache is empty. Warming up cache from database...');
      // Warm up: fetch top 1000 posts from database
      const topPosts = await this.prisma.post.findMany({
        where: { visibility: PostVisibility.PUBLIC, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1000,
      });

      if (topPosts.length > 0) {
        const pipeline = client.pipeline();
        for (const p of topPosts) {
          const pIdStr = p.id.toString();
          pipeline.zadd(feedKey, p.createdAt.getTime(), pIdStr);
          
          // Populate individual details cache in the pipeline
          const detailKey = this.getRedisKey(`post:details:${pIdStr}`);
          pipeline.set(
            detailKey,
            JSON.stringify(this.serializePost(p)),
            'EX',
            86400, // 24 hours
          );
        }
        await pipeline.exec();
      }
    }

    // 2. Fetch post IDs from sorted set
    const postIds = await client.zrevrange(feedKey, start, stop);
    if (!postIds.length) {
      return [];
    }

    // 3. Batch fetch post details from Redis
    const cacheKeys = postIds.map((id) => `post:details:${id}`);
    const cachedPosts = await this.redisService.mGet<any>(cacheKeys);

    // 4. Identify and query cache misses
    const missedIds: bigint[] = [];
    const missedIndexes: number[] = [];

    cachedPosts.forEach((post, index) => {
      if (post === null) {
        missedIds.push(BigInt(postIds[index]));
        missedIndexes.push(index);
      }
    });

    if (missedIds.length > 0) {
      this.logger.log(`Cache miss for posts: [${missedIds.join(', ')}]. Fetching from database.`);
      const dbPosts = await this.prisma.post.findMany({
        where: { id: { in: missedIds } },
      });

      const dbPostsMap = new Map<string, any>();
      dbPosts.forEach((p) => dbPostsMap.set(p.id.toString(), p));

      const msetEntries: any[] = [];
      for (let i = 0; i < missedIds.length; i++) {
        const idStr = missedIds[i].toString();
        const post = dbPostsMap.get(idStr);
        const originalIndex = missedIndexes[i];

        if (post) {
          const serialized = this.serializePost(post);
          cachedPosts[originalIndex] = serialized;

          msetEntries.push({
            key: `post:details:${idStr}`,
            value: serialized,
            ttl: 86400,
          });
        } else {
          // Post deleted or not found in DB but index exists -> clean up from feed cache
          await client.zrem(feedKey, idStr);
          cachedPosts[originalIndex] = null;
        }
      }

      // Save resolved posts back to Redis
      if (msetEntries.length > 0) {
        await this.redisService.mSet(msetEntries);
      }
    }

    return cachedPosts.filter(Boolean);
  }


  /**
   * Retrieves the authenticated user's posts in reverse chronological order.
   */
  async getMyPosts(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const posts = await this.prisma.post.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    });

    return posts.map((post) => this.serializePost(post));
  }

  /**
   * Updates caption and/or imageUrl of a post, synchronizes caches.
   */
  async updatePost(userId: string, postId: string, dto: UpdatePostDto) {
    this.logger.log(`User ${userId} updating post ${postId}`);
    const id = BigInt(postId);

    // 1. Fetch from DB to verify ownership and existence
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.deletedAt) {
      throw new NotFoundException('Post not found');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('You are not authorized to edit this post');
    }

    // 2. Update in DB
    const updatedPost = await this.prisma.post.update({
      where: { id },
      data: {
        caption: dto.caption !== undefined ? dto.caption : post.caption,
        imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : post.imageUrl,
      },
    });

    const serialized = this.serializePost(updatedPost);

    // 3. Update details cache
    const cacheKey = `post:details:${postId}`;
    await this.redisService.set(cacheKey, serialized, { ttl: 86400, jitter: true });

    return serialized;
  }

  /**
   * Performs soft deletion of a post, removes from feed indexes and invalidates details caches.
   */
  async deletePost(userId: string, postId: string) {
    this.logger.log(`User ${userId} deleting post ${postId}`);
    const id = BigInt(postId);

    // 1. Fetch from DB
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.deletedAt) {
      throw new NotFoundException('Post not found');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('You are not authorized to delete this post');
    }

    // 2. Soft delete in DB
    await this.prisma.post.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // 3. Remove details cache
    const cacheKey = `post:details:${postId}`;
    await this.redisService.del(cacheKey);

    // 4. Remove from recent feed sorted set
    const feedKey = this.getRedisKey('posts:recent');
    await this.redisService.getClient().zrem(feedKey, postId);

    return { success: true };
  }
}
