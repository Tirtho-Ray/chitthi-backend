import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AtGuard } from '../../../core/jwt/at.guard';
import { GetUser } from '../../../core/jwt/get-user.decorator';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { CreateReplyDto } from '../dto/create-reply.dto';
import { InteractionsService } from '../service/interactions.service';

@ApiTags('Interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) { }

  @ApiOperation({ summary: 'Like a post' })
  @ApiResponse({ status: 200, description: 'Post liked successfully' })
  @UseGuards(AtGuard)
  @Post('posts/:postId/like')
  likePost(@GetUser('id') userId: string, @Param('postId') postId: string) {
    return this.interactionsService.likePost(userId, postId);
  }

  @ApiOperation({ summary: 'Unlike a post' })
  @ApiResponse({ status: 200, description: 'Post unliked successfully' })
  @UseGuards(AtGuard)
  @Delete('posts/:postId/like')
  unlikePost(@GetUser('id') userId: string, @Param('postId') postId: string) {
    return this.interactionsService.unlikePost(userId, postId);
  }

  @ApiOperation({ summary: 'Add a comment to a post' })

  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  @UseGuards(AtGuard)
  @Post('posts/:postId/comments')
  createComment(
    @GetUser('id') userId: string,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.interactionsService.createComment(userId, postId, dto);
  }

  @ApiOperation({ summary: 'Get comments for a post' })
  @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Comment ID cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @UseGuards(AtGuard)
  @Get('posts/:postId/comments')
  getPostComments(
    @Param('postId') postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.interactionsService.getPostComments(postId, cursor, limit ?? 20);
  }

  @ApiOperation({ summary: 'Reply to a comment' })
  @ApiResponse({ status: 201, description: 'Reply created successfully' })
  @UseGuards(AtGuard)
  @Post('comments/:commentId/replies')
  replyToComment(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
    @Body() dto: CreateReplyDto,
  ) {
    return this.interactionsService.replyToComment(userId, commentId, dto);
  }

  @ApiOperation({ summary: 'Get replies for a comment' })

  @ApiResponse({ status: 200, description: 'Replies retrieved successfully' })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Reply ID cursor for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @UseGuards(AtGuard)
  @Get('comments/:commentId/replies')
  getCommentReplies(
    @Param('commentId') commentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.interactionsService.getCommentReplies(commentId, cursor, limit ?? 20);
  }

  @ApiOperation({ summary: 'Like a comment' })
  @ApiResponse({ status: 200, description: 'Comment liked successfully' })
  @UseGuards(AtGuard)
  @Post('comments/:commentId/like')
  likeComment(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.interactionsService.likeComment(userId, commentId);
  }

  @ApiOperation({ summary: 'Unlike a comment' })
  @ApiResponse({ status: 200, description: 'Comment unliked successfully' })
  @UseGuards(AtGuard)
  @Delete('comments/:commentId/like')
  unlikeComment(
    @GetUser('id') userId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.interactionsService.unlikeComment(userId, commentId);
  }
}
