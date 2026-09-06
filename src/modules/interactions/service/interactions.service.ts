import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InteractionQueueProducer } from '../../../common/queues/producers/interactions-queue.producer';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { CreateReplyDto } from '../dto/create-reply.dto';

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interactionQueueProducer: InteractionQueueProducer,
  ) {}

  private toBigInt(id: string): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new NotFoundException('Invalid identifier');
    }
  }

  private serializeComment(comment: any) {
    return {
      id: comment.id.toString(),
      publicId: comment.publicId,
      postId: comment.postId.toString(),
      userId: comment.userId.toString(),
      parentId: comment.parentId ? comment.parentId.toString() : null,
      rootId: comment.rootId ? comment.rootId.toString() : null,
      content: comment.content,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deletedAt: comment.deletedAt,
      author: comment.user
        ? {
            id: comment.user.id,
            publicId: comment.user.publicId,
            name: comment.user.name,
          }
        : null,
    };
  }

  async likePost(userId: string, postId: string) {
    const id = this.toBigInt(postId);

    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: { likeCount: true, deletedAt: true },
      });
      if (!post || post.deletedAt) {
        throw new NotFoundException('Post not found');
      }

      const existing = await tx.postLike.findUnique({
        where: { postId_userId: { postId: id, userId } },
      });
      if (existing) {
        return { liked: true, likeCount: post.likeCount, alreadyLiked: true };
      }

      await tx.postLike.create({ data: { postId: id, userId } });
      const updatedPost = await tx.post.update({
        where: { id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updatedPost.likeCount, alreadyLiked: false };
    });

    void this.interactionQueueProducer.postLiked(userId, postId).catch((error) => {
      this.logger.warn('Failed to enqueue post like cache sync for ' + postId + ': ' + error.message);
    });

    return result;
  }

  async unlikePost(userId: string, postId: string) {
    const id = this.toBigInt(postId);

    const result = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: { likeCount: true, deletedAt: true },
      });
      if (!post || post.deletedAt) {
        throw new NotFoundException('Post not found');
      }

      const existing = await tx.postLike.findUnique({
        where: { postId_userId: { postId: id, userId } },
      });
      if (!existing) {
        return { liked: false, likeCount: post.likeCount, alreadyUnliked: true };
      }

      await tx.postLike.delete({
        where: { postId_userId: { postId: id, userId } },
      });
      const updatedPost = await tx.post.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updatedPost.likeCount, alreadyUnliked: false };
    });

    void this.interactionQueueProducer.postUnliked(userId, postId).catch((error) => {
      this.logger.warn('Failed to enqueue post unlike cache sync for ' + postId + ': ' + error.message);
    });

    return result;
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    const id = this.toBigInt(postId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Content is required');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id },
        select: { deletedAt: true },
      });
      if (!post || post.deletedAt) {
        throw new NotFoundException('Post not found');
      }

      const created = await tx.comment.create({
        data: {
          postId: id,
          userId,
          content,
          parentId: null,
          rootId: null,
        },
        include: {
          user: {
            select: { id: true, publicId: true, name: true },
          },
        },
      });

      await tx.post.update({
        where: { id },
        data: { commentCount: { increment: 1 } },
      });

      return created;
    });

    void this.interactionQueueProducer.commentCreated(userId, postId, comment.id.toString()).catch((error) => {
      this.logger.warn('Failed to enqueue comment cache sync for post ' + postId + ': ' + error.message);
    });

    return this.serializeComment(comment);
  }

  async replyToComment(userId: string, commentId: string, dto: CreateReplyDto) {
    const id = this.toBigInt(commentId);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Content is required');
    }

    const reply = await this.prisma.$transaction(async (tx) => {
      const parent = await tx.comment.findUnique({
        where: { id },
        select: { id: true, postId: true, rootId: true, deletedAt: true },
      });
      if (!parent || parent.deletedAt) {
        throw new NotFoundException('Comment not found');
      }

      const post = await tx.post.findUnique({
        where: { id: parent.postId },
        select: { deletedAt: true },
      });
      if (!post || post.deletedAt) {
        throw new NotFoundException('Post not found');
      }

      const rootId = parent.rootId ?? parent.id;
      const created = await tx.comment.create({
        data: {
          postId: parent.postId,
          userId,
          content,
          parentId: parent.id,
          rootId,
        },
        include: {
          user: {
            select: { id: true, publicId: true, name: true },
          },
        },
      });

      await Promise.all([
        tx.post.update({
          where: { id: parent.postId },
          data: { commentCount: { increment: 1 } },
        }),
        tx.comment.update({
          where: { id: parent.id },
          data: { replyCount: { increment: 1 } },
        }),
      ]);

      return created;
    });

    void this.interactionQueueProducer.replyCreated(userId, reply.postId.toString(), reply.id.toString(), commentId).catch((error) => {
      this.logger.warn('Failed to enqueue reply cache sync for comment ' + commentId + ': ' + error.message);
    });

    return this.serializeComment(reply);
  }

  async likeComment(userId: string, commentId: string) {
    const id = this.toBigInt(commentId);

    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id },
        select: { likeCount: true, deletedAt: true },
      });
      if (!comment || comment.deletedAt) {
        throw new NotFoundException('Comment not found');
      }

      const existing = await tx.commentLike.findUnique({
        where: { commentId_userId: { commentId: id, userId } },
      });
      if (existing) {
        return { liked: true, likeCount: comment.likeCount, alreadyLiked: true };
      }

      await tx.commentLike.create({ data: { commentId: id, userId } });
      const updatedComment = await tx.comment.update({
        where: { id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updatedComment.likeCount, alreadyLiked: false };
    });

    void this.interactionQueueProducer.commentLiked(userId, commentId).catch((error) => {
      this.logger.warn('Failed to enqueue comment like cache sync for ' + commentId + ': ' + error.message);
    });

    return result;
  }

  async unlikeComment(userId: string, commentId: string) {
    const id = this.toBigInt(commentId);

    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id },
        select: { likeCount: true, deletedAt: true },
      });
      if (!comment || comment.deletedAt) {
        throw new NotFoundException('Comment not found');
      }

      const existing = await tx.commentLike.findUnique({
        where: { commentId_userId: { commentId: id, userId } },
      });
      if (!existing) {
        return { liked: false, likeCount: comment.likeCount, alreadyUnliked: true };
      }

      await tx.commentLike.delete({
        where: { commentId_userId: { commentId: id, userId } },
      });
      const updatedComment = await tx.comment.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updatedComment.likeCount, alreadyUnliked: false };
    });

    void this.interactionQueueProducer.commentUnliked(userId, commentId).catch((error) => {
      this.logger.warn('Failed to enqueue comment unlike cache sync for ' + commentId + ': ' + error.message);
    });

    return result;
  }

  async getPostComments(postId: string, cursor?: string, limit = 20) {
    const id = this.toBigInt(postId);
    const cursorId = cursor ? this.toBigInt(cursor) : undefined;

    const comments = await this.prisma.comment.findMany({
      where: {
        postId: id,
        parentId: null,
        deletedAt: null,
        ...(cursorId ? { id: { lt: cursorId } } : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
      include: {
        user: {
          select: { id: true, publicId: true, name: true },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = comments.slice(0, limit).map((comment) => this.serializeComment(comment));

    return {
      items,
      nextCursor: hasMore ? comments[limit - 1].id.toString() : null,
    };
  }

  async getCommentReplies(commentId: string, cursor?: string, limit = 20) {
    const id = this.toBigInt(commentId);
    const cursorId = cursor ? this.toBigInt(cursor) : undefined;

    const replies = await this.prisma.comment.findMany({
      where: {
        parentId: id,
        deletedAt: null,
        ...(cursorId ? { id: { lt: cursorId } } : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
      include: {
        user: {
          select: { id: true, publicId: true, name: true },
        },
      },
    });

    const hasMore = replies.length > limit;
    const items = replies.slice(0, limit).map((reply) => this.serializeComment(reply));

    return {
      items,
      nextCursor: hasMore ? replies[limit - 1].id.toString() : null,
    };
  }
}
