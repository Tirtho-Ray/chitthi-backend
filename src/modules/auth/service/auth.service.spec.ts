jest.mock('prisma/generated/prisma/client', () => ({
  OTPType: {
    EMAIL_VERIFY: 'EMAIL_VERIFY',
    PASSWORD_RESET: 'PASSWORD_RESET',
  },
}));

jest.mock('../../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./token.service', () => ({
  TokenService: class TokenService {},
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomLoggerService } from '../../../common/logger/logger.service';
import { AuthQueueProducer } from '../../../common/queues/producers/auth-queue.producer';
import { EmailQueueProducer } from '../../../common/queues/producers/email-queue.producer';
import { RedisService } from '../../../common/redis/services/redis.service';
import { SecurityUtil } from '../../../common/security/security.util';

function mockConfig(): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T => {
      const map: Record<string, unknown> = {
        'auth.OTP_TTL_SECONDS': 60,
        'auth.OTP_MAX_ATTEMPTS': 5,
        'auth.MAX_LOGIN_ATTEMPTS': 5,
        'auth.ACCOUNT_LOCKOUT_MINUTES': 30,
      };
      return (map[key] ?? defaultValue) as T;
    },
  } as ConfigService;
}

describe('AuthService security', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    authSecurity: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let redisService: { rateLimit: jest.Mock };
  let tokenService: { getTokens: jest.Mock; handleSessionUpdate: jest.Mock };
  let authQueue: { addLoginHistoryJob: jest.Mock; addAuditLogJob: jest.Mock };

  const loginDto = {
    email: 'user@test.com',
    password: 'secret123',
    deviceId: '550e8400-e29b-41d4-a716-446655440000',
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      authSecurity: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma as unknown as typeof prisma),
      ),
    };
    redisService = {
      rateLimit: jest.fn().mockResolvedValue({ allowed: true, resetInSeconds: 0 }),
    };
    tokenService = {
      getTokens: jest.fn().mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        jti: 'jti-1',
        family: 'fam-1',
      }),
      handleSessionUpdate: jest.fn().mockResolvedValue(undefined),
    };
    authQueue = {
      addLoginHistoryJob: jest.fn(),
      addAuditLogJob: jest.fn(),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      tokenService as unknown as TokenService,
      {} as CustomLoggerService,
      mockConfig(),
      authQueue as unknown as AuthQueueProducer,
      {} as EmailQueueProducer,
      redisService as unknown as RedisService,
    );
  });

  it('rejects unknown email with generic invalid credentials (no enumeration)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login(loginDto, '127.0.0.1', 'jest')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.login(loginDto, '127.0.0.1', 'jest')).rejects.toThrow(
      'Invalid credentials',
    );
  });

  it('rejects SQL injection payloads as invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login(
        {
          ...loginDto,
          email: "admin' OR '1'='1",
          password: "' OR 1=1 --",
        },
        '127.0.0.1',
        'jest',
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('records failed attempts and locks account after 5 failures', async () => {
    const passwordHash = await SecurityUtil.hashData('correct-password', true);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: passwordHash,
      status: 'ACTIVE',
      tokenVersion: 1,
      authSecurity: { failedAttempts: 4, lockExpiresAt: null },
    });
    prisma.authSecurity.findUnique.mockResolvedValue({ failedAttempts: 4 });

    await expect(
      service.login({ ...loginDto, password: 'wrong-password' }, '127.0.0.1', 'jest'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.authSecurity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          failedAttempts: 5,
          lockExpiresAt: expect.any(Date),
        }),
      }),
    );
  });

  it('blocks login while account lock is active', async () => {
    const lockExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: 'hash',
      status: 'ACTIVE',
      tokenVersion: 1,
      authSecurity: { failedAttempts: 5, lockExpiresAt },
    });

    await expect(service.login(loginDto, '127.0.0.1', 'jest')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.login(loginDto, '127.0.0.1', 'jest')).rejects.toThrow(
      /temporarily locked/i,
    );
  });

  it('resets failed attempts on successful login', async () => {
    const passwordHash = await SecurityUtil.hashData(loginDto.password, true);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: passwordHash,
      status: 'ACTIVE',
      tokenVersion: 1,
      authSecurity: { failedAttempts: 2, lockExpiresAt: null },
    });

    await service.login(loginDto, '127.0.0.1', 'jest');

    expect(prisma.authSecurity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          failedAttempts: 0,
          lockExpiresAt: null,
        }),
      }),
    );
  });

  it('uses 30-minute redis window for per-account login rate limit', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.login(loginDto, '127.0.0.1', 'jest')).rejects.toThrow();

    expect(redisService.rateLimit).toHaveBeenCalledWith(
      'login-account:user@test.com',
      5,
      1800,
    );
  });
});
