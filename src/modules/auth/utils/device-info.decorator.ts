import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export class DeviceInfo {
  userAgent: string;
  ip: string;
  constructor(userAgent: string, ip: string) {
    this.userAgent = userAgent;
    this.ip = ip;
  }
}

export const GetDeviceInfo = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): DeviceInfo => {
    const request = ctx.switchToHttp().getRequest<Request>();

    const rawIp = request.ip || request.socket.remoteAddress || '0.0.0.0';

    const userAgent = request.headers['user-agent'] || 'unknown';

    return new DeviceInfo(userAgent, rawIp);
  },
);
