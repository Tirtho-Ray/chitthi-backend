import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '@/src/common/redis/services/redis.service';

@Injectable()
export class TokenBucketGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const userId = request.user?.id;
    const key = userId || ip;

    // Capacity of 10 tokens, refilling at 2 tokens per second
    const { hasTokens } = await this.redis.tokenBucket(key, 10, 2);

    if (!hasTokens) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please wait before trying again.',
          error: 'ThrottlerException',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
