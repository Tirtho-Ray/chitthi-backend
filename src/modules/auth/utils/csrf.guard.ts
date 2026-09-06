import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    if (req.method === 'GET') return true;

    if (this.isDevelopment()) return true;

    const authHeader = req.get('authorization');
    const hasBearerToken =
      typeof authHeader === 'string' && /^Bearer\s+\S+/i.test(authHeader);

    // Explicit bearer-token requests are not susceptible to browser-driven CSRF
    // in the same way cookie-authenticated requests are.
    if (hasBearerToken) return true;

    const csrfCookie = (req.cookies as Record<string, string>)['csrf_token'];
    const csrfHeader = req.get('x-csrf-token');

    if (!csrfCookie || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF blocked');
    }
    return true;
  }

  private isDevelopment(): boolean {
    const nodeEnv =
      this.config.get<string>('node_env') ??
      this.config.get<string>('NODE_ENV') ??
      'development';

    return nodeEnv !== 'production';
  }
}
