import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './jwt.constants';
import { RedisService } from '@/src/common/redis/services/redis.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private redis: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const isValid = await super.canActivate(context);
    if (!isValid) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.jti) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const isBlacklisted = await this.redis.get(`bl:${user.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    const isActive = await this.redis.get(`active_session:${user.jti}`);
    if (!isActive) {
      throw new UnauthorizedException('Session expired or inactive');
    }

    return true;
  }
}
