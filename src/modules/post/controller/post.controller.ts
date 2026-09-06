import { Controller, Post, Body, Patch, Param, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PostService } from '../service/post.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { UpdateVisibilityDto } from '../dto/update-visibility.dto';
import { UpdatePostDto } from '../dto/update-post.dto';
import { AtGuard } from '../../../core/jwt/at.guard';
import { CreatePostRateLimitGuard } from '../guard/create-post-rate-limit.guard';
import { GetUser } from '../../../core/jwt/get-user.decorator';

@ApiTags('Posts')
@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) { }

  @ApiOperation({ summary: 'Create a new post' })
  @ApiResponse({ status: 201, description: 'Post successfully created' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @UseGuards(AtGuard, CreatePostRateLimitGuard)
  @Post()
  async createPost(
    @GetUser('id') userId: string,
    @Body() createPostDto: CreatePostDto,
  ) {
    return this.postService.createPost(userId, createPostDto);
  }

  @ApiOperation({ summary: 'Update visibility of an existing post' })
  @ApiResponse({ status: 200, description: 'Visibility successfully updated' })
  @ApiResponse({ status: 403, description: 'Forbidden from updating another user\'s post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @UseGuards(AtGuard)
  @Patch(':id/visibility')
  async updateVisibility(
    @GetUser('id') userId: string,
    @Param('id') postId: string,
    @Body() updateVisibilityDto: UpdateVisibilityDto,
  ) {
    return this.postService.updateVisibility(userId, postId, updateVisibilityDto.visibility);
  }

  @ApiOperation({ summary: 'Edit an existing post' })
  @ApiResponse({ status: 200, description: 'Post successfully updated' })
  @ApiResponse({ status: 403, description: 'Forbidden from editing another user\'s post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @UseGuards(AtGuard)
  @Patch(':id')
  async editPost(
    @GetUser('id') userId: string,
    @Param('id') postId: string,
    @Body() updatePostDto: UpdatePostDto,
  ) {
    return this.postService.updatePost(userId, postId, updatePostDto);
  }

  @ApiOperation({ summary: 'Delete an existing post (soft delete)' })
  @ApiResponse({ status: 200, description: 'Post successfully deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden from deleting another user\'s post' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @UseGuards(AtGuard)
  @Delete(':id')
  async deletePost(
    @GetUser('id') userId: string,
    @Param('id') postId: string,
  ) {
    return this.postService.deletePost(userId, postId);
  }

  @ApiOperation({ summary: 'Get recent public feed (reverse chronological)' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved recent feed' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @Get('recent')
  async getRecentFeed(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.postService.getRecentFeed(page, limit);
  }

  @ApiOperation({ summary: 'Get my posts', description: 'Returns the authenticated user\'s posts in reverse chronological order.' })
  @ApiResponse({ status: 200, description: 'Successfully retrieved your posts' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @UseGuards(AtGuard)
  @Get('me')
  async getMyPosts(
    @GetUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.postService.getMyPosts(userId, page, limit);
  }
}
