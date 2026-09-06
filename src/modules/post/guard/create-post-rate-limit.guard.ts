import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../../common/redis/services/redis.service';

@Injectable()
export class CreatePostRateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown-ip';

    // Rate limit target: prefer authenticated user ID, fallback to client IP
    const identifier = userId ? `create-post:user:${userId}` : `create-post:ip:${ip}`;

    // Configure limits: e.g., max 5 post creations per 60 seconds
    const limit = 5;
    const windowSeconds = 60;

    const result = await this.redisService.rateLimit(identifier, limit, windowSeconds);

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Post creation rate limit exceeded. Try again in ${result.resetInSeconds} seconds.`,
          retryAfter: result.resetInSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
