import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class RtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private config: ConfigService) {
    const secret = config.get<string>('jwt.refresh_secret');
    if (!secret) {
      throw new InternalServerErrorException('JWT Refresh Secret is missing in config');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.['refresh_token'];
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: any) {
    const refreshToken =
      req.cookies?.['refresh_token'] ||
      req.get('authorization')?.replace(/Bearer\s+/i, '');

    if (!payload || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    return {
      ...payload,
      refreshToken,
    };
  }
}
