import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id || req.ip;
  }
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests! Please wait a minute before trying again.',
        error: 'ThrottlerException',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
