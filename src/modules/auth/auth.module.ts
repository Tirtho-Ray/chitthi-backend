import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthController } from './controller/auth.controller';
import { AuthService } from './service/auth.service';
import { TokenService } from './service/token.service';
import { AtStrategy } from '../../core/jwt/at.strategy';
import { RtStrategy } from '../../core/jwt/rt.strategy';
import { AtGuard } from '../../core/jwt/at.guard';
import { RtGuard } from '../../core/jwt/rt.guard';
import { RedisService } from '../../common/redis/services/redis.service';
import { CsrfGuard } from './utils/csrf.guard';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AtStrategy,
    RtStrategy,
    AtGuard,
    RtGuard,
    RedisService,
    CsrfGuard,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule { }
