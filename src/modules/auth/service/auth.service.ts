import { Injectable, ConflictException, UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenService } from './token.service';
import { CustomLoggerService } from '../../../common/logger/logger.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Tokens } from '../interfaces/tokens.interface';
import { ConfigService } from '@nestjs/config';
import { SecurityUtil } from '../../../common/security/security.util';
import { AuthQueueProducer } from '../../../common/queues/producers/auth-queue.producer';
import { AuditSeverity, AuditStatus } from '../../../common/queues/queues.constants';
import { EmailQueueProducer } from '../../../common/queues/producers/email-queue.producer';
import { OtpType } from '../../../common/queues/types/email.type';
import { OTPType } from '@/prisma/generated/prisma/client';
import { RedisService } from '../../../common/redis/services/redis.service';

@Injectable()
export class AuthService {
  private readonly dummyPasswordHashPromise = SecurityUtil.hashData(
    'invalid-password',
    true,
  );
  private readonly otpTtlSeconds: number;
  private readonly otpMaxAttempts: number;
  private readonly maxLoginAttempts: number;
  private readonly accountLockoutMinutes: number;
  private readonly invalidCredentialsMessage = 'Invalid credentials';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly logger: CustomLoggerService,
    private readonly config: ConfigService,
    private readonly authQueue: AuthQueueProducer,
    private readonly emailQueue: EmailQueueProducer,
    private readonly redisService: RedisService
  ) {
    this.otpTtlSeconds = this.config.get<number>('auth.OTP_TTL_SECONDS', 60);
    this.otpMaxAttempts = this.config.get<number>('auth.OTP_MAX_ATTEMPTS', 5);
    this.maxLoginAttempts = this.config.get<number>('auth.MAX_LOGIN_ATTEMPTS', 5);
    this.accountLockoutMinutes = this.config.get<number>(
      'auth.ACCOUNT_LOCKOUT_MINUTES',
      30,
    );
  }

  async signup(dto: RegisterDto, ip: string, ua: string): Promise<{ userId: string }> {
    const email = dto.email.toLowerCase();

    // IP Level Rate Limit
    const ipLimit = await this.redisService.rateLimit(`rl:ip:${ip}`, 10, 60);
    if (!ipLimit.allowed) {
      throw new ForbiddenException('Too many signup attempts from this IP. Please try after an hour.');
    }

    // Email Level Rate Limit: 1 m send mail
    const emailLimit = await this.redisService.rateLimit(`rl:otp:${email}`, 1, 60);
    if (!emailLimit.allowed) {
      throw new BadRequestException(`Please wait ${emailLimit.resetInSeconds}s before requesting another OTP.`);
    }

    // check if user active
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });

    if (existingUser && existingUser.status === 'ACTIVE') {
      // Timing attack prevention
      await SecurityUtil.hashData(dto.password, true).catch(() => { });
      throw new ConflictException('Email already exists and is verified.');
    }

    //
    const passwordHash = await SecurityUtil.hashData(dto.password, true);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let userId: string;

        if (existingUser && existingUser.status === 'PENDING') {
          const updatedUser = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              password: passwordHash,
              authSecurity: { update: { lastLoginIp: ip, lastLoginAt: new Date() } }
            },
            select: { id: true }
          });
          userId = updatedUser.id;
        } else {
          // New user create
          const newUser = await tx.user.create({
            data: {
              email,
              password: passwordHash,
              status: 'PENDING',
              authSecurity: {
                create: { hasPassword: true, lastLoginIp: ip, lastLoginAt: new Date() }
              },
            },
            select: { id: true }
          });
          userId = newUser.id;
        }


        // generate otp
        const otp = SecurityUtil.generateOTP(6);
        const otpHash = await SecurityUtil.hashData(otp, false);
        const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);

        await tx.verificationToken.upsert({
          where: { identifier_type: { identifier: email, type: OTPType.EMAIL_VERIFY } },
          update: { token: otpHash, expiresAt, usedAt: null, attempts: 0, userId },
          create: {
            identifier: email,
            token: otpHash,
            type: OTPType.EMAIL_VERIFY,
            expiresAt,
            userId,
          },
        });

        // send mail throw queue
        void this.emailQueue.addOtpEmailJob({
          email,
          otp,
          type: OtpType.REGISTER,
        });

        this.logger.log(`OTP sent to ${email}. Status: PENDING`, 'AuthService');
        return { userId };
      }, { timeout: 15000 });

    } catch (error: any) {
      this.logger.error(`Signup Failed: ${error.message}`, 'AuthService');
      if (error.code === 'P2002') throw new ConflictException('Email already exists');
      throw error;
    }
  }



  async verifyEmailOtp(params: { email: string; otp: string; deviceId: string; ip: string; ua: string }): Promise<Tokens> {
    const email = params.email.toLowerCase();
    const now = new Date();

    const ipLimit = await this.redisService.rateLimit(`verify-ip:${params.ip}`, 10, 3600);
    if (!ipLimit.allowed) {
      throw new ForbiddenException('Too many verification attempts from this IP. Please try later.');
    }

    const emailLimit = await this.redisService.rateLimit(`verify-email:${email}`, 5, 300);
    if (!emailLimit.allowed) {
      throw new ForbiddenException(`Too many verification attempts. Please try in ${emailLimit.resetInSeconds}s.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, status: true, tokenVersion: true },
      });
      if (!user) throw new UnauthorizedException('Invalid OTP');

      const tokenRow = await tx.verificationToken.findUnique({
        where: { identifier_type: { identifier: email, type: OTPType.EMAIL_VERIFY } },
      });
      if (!tokenRow || tokenRow.usedAt) throw new UnauthorizedException('Invalid OTP');
      if (tokenRow.expiresAt <= now) throw new UnauthorizedException('OTP expired');
      if (tokenRow.attempts >= this.otpMaxAttempts) throw new ForbiddenException('Too many attempts');

      const ok = await SecurityUtil.compareData(params.otp, tokenRow.token, false);
      if (!ok) {
        await tx.verificationToken.update({
          where: { id: tokenRow.id },
          data: { attempts: { increment: 1 } },
        });
        throw new UnauthorizedException('Invalid OTP');
      }

      await tx.verificationToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' },
      });

      const tokens = await this.tokenService.getTokens(user.id, user.tokenVersion, params.deviceId);
      await this.tokenService.handleSessionUpdate(
        user.id,
        params.deviceId,
        tokens.refreshToken,
        tokens.jti,
        params.ip,
        params.ua,
        tx,
        tokens.family,
      );
      return tokens;
    });
  }



  async requestPasswordResetOtp(emailRaw: string, ip?: string): Promise<void> {
    const email = emailRaw.toLowerCase();

    if (ip) {
      const ipLimit = await this.redisService.rateLimit(`forgot-password-ip:${ip}`, 5, 3600);
      if (!ipLimit.allowed) {
        throw new ForbiddenException('Too many password reset requests from this IP. Please try later.');
      }
    }

    const emailLimit = await this.redisService.rateLimit(`forgot-password-email:${email}`, 1, 120);
    if (!emailLimit.allowed) {
      throw new BadRequestException(`Please wait ${emailLimit.resetInSeconds}s before requesting another OTP.`);
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true, password: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new NotFoundException('Account not found or not active');
    }
    if (!user.password) {
      throw new BadRequestException('This account does not have a password configured.');
    }

    const otp = SecurityUtil.generateOTP(6);
    const otpHash = await SecurityUtil.hashData(otp, false);
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);

    await this.prisma.verificationToken.upsert({
      where: { identifier_type: { identifier: email, type: OTPType.PASSWORD_RESET } },
      update: { token: otpHash, expiresAt, usedAt: null, attempts: 0, userId: user.id },
      create: { identifier: email, token: otpHash, type: OTPType.PASSWORD_RESET, expiresAt, userId: user.id },
    });

    void this.emailQueue.addOtpEmailJob({ email, otp, type: OtpType.FORGOT_PASSWORD });
  }

  async resetPasswordWithOtp(params: { email: string; otp: string; newPassword: string; ip: string; ua: string }): Promise<void> {
    const email = params.email.toLowerCase();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true, status: true, tokenVersion: true, password: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid OTP');
      if (!user.password) throw new BadRequestException('This account does not have a password configured.');

      const tokenRow = await tx.verificationToken.findUnique({
        where: { identifier_type: { identifier: email, type: OTPType.PASSWORD_RESET } },
      });
      if (!tokenRow || tokenRow.usedAt) throw new UnauthorizedException('Invalid OTP');
      if (tokenRow.expiresAt <= now) throw new UnauthorizedException('OTP expired');
      if (tokenRow.attempts >= this.otpMaxAttempts) throw new ForbiddenException('Too many attempts');

      const ok = await SecurityUtil.compareData(params.otp, tokenRow.token, false);
      if (!ok) {
        await tx.verificationToken.update({ where: { id: tokenRow.id }, data: { attempts: { increment: 1 } } });
        throw new UnauthorizedException('Invalid OTP');
      }

      await tx.verificationToken.update({ where: { id: tokenRow.id }, data: { usedAt: now } });

      const passwordHash = await SecurityUtil.hashData(params.newPassword, true);
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          tokenVersion: { increment: 1 },
          authSecurity: { update: { lastPasswordChange: now } },
        },
      });
      // Revoke all sessions after password reset (same transaction)
      await Promise.all([
        tx.refreshToken.updateMany({
          where: { userId: user.id },
          data: { isRevoked: true, revokeReason: 'PASSWORD_RESET', revokedAt: now },
        }),
        tx.session.updateMany({
          where: { userId: user.id },
          data: { isActive: false },
        }),
      ]);
    });
  }



  async changePassword(params: { userId: string; oldPassword: string; newPassword: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, password: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Unauthorized');
    if (!user.password) throw new BadRequestException('This account does not have a password configured.');

    const ok = await SecurityUtil.compareData(params.oldPassword, user.password, true);
    if (!ok) throw new BadRequestException('Old password incorrect');

    const passwordHash = await SecurityUtil.hashData(params.newPassword, true);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.user.update({
        where: { id: user.id },
        data: {
          password: passwordHash,
          tokenVersion: { increment: 1 },
          authSecurity: { update: { lastPasswordChange: now } },
        },
      });
      await Promise.all([
        tx.refreshToken.updateMany({
          where: { userId: user.id },
          data: { isRevoked: true, revokeReason: 'PASSWORD_CHANGE', revokedAt: now },
        }),
        tx.session.updateMany({
          where: { userId: user.id },
          data: { isActive: false },
        }),
      ]);
    });
  }




  async login(dto: LoginDto, ip: string, ua: string): Promise<Tokens> {
    const email = dto.email.toLowerCase();
    const lockoutWindowSeconds = this.accountLockoutMinutes * 60;

    const ipLimit = await this.redisService.rateLimit(`login-ip:${ip}`, 20, 3600);
    if (!ipLimit.allowed) {
      throw new ForbiddenException('Too many login attempts from this IP. Please try later.');
    }

    const accountLimit = await this.redisService.rateLimit(
      `login-account:${email}`,
      this.maxLoginAttempts,
      lockoutWindowSeconds,
    );
    if (!accountLimit.allowed) {
      throw new ForbiddenException(
        `Too many login attempts for this account. Please try in ${Math.ceil(accountLimit.resetInSeconds / 60)} minutes.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        password: true,
        status: true,
        tokenVersion: true,
        authSecurity: {
          select: { failedAttempts: true, lockExpiresAt: true },
        },
      },
    });

    if (user?.authSecurity?.lockExpiresAt && user.authSecurity.lockExpiresAt > new Date()) {
      const resetInSeconds = Math.ceil(
        (user.authSecurity.lockExpiresAt.getTime() - Date.now()) / 1000,
      );
      throw new ForbiddenException(
        `Account temporarily locked due to too many failed attempts. Please try again in ${Math.ceil(resetInSeconds / 60)} minutes.`,
      );
    }

    if (!user) {
      try {
        const dummyHash = await this.dummyPasswordHashPromise;
        await SecurityUtil.compareData(dto.password, dummyHash, true);
      } catch { }
      throw new UnauthorizedException(this.invalidCredentialsMessage);
    }

    if (!user.password) {
      try {
        const dummyHash = await this.dummyPasswordHashPromise;
        await SecurityUtil.compareData(dto.password, dummyHash, true);
      } catch { }
      throw new UnauthorizedException(this.invalidCredentialsMessage);
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active');

    const ok = await SecurityUtil.compareData(dto.password, user.password, true);
    if (!ok) {
      await this.recordFailedLoginAttempt(user.id, ip, ua);
      throw new UnauthorizedException(this.invalidCredentialsMessage);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.authSecurity.update({
        where: { userId: user.id },
        data: {
          failedAttempts: 0,
          lockExpiresAt: null,
          lastFailedAt: null,
          lastLoginIp: ip,
          lastLoginAt: new Date(),
        },
      });

      const tokens = await this.tokenService.getTokens(
        user.id,
        user.tokenVersion,
        dto.deviceId,
      );

      await this.tokenService.handleSessionUpdate(
        user.id,
        dto.deviceId,
        tokens.refreshToken,
        tokens.jti,
        ip,
        ua,
        tx,
        tokens.family,
      );

      void this.authQueue.addAuditLogJob({
        userId: user.id,
        action: 'AUTH_LOGIN',
        status: AuditStatus.SUCCESS,
        severity: AuditSeverity.LOW,
        ipAddress: ip,
        userAgent: ua,
        metadata: { method: 'password' },
      } as any);

      return tokens;
    });
  }

  /** Increment failed login counter; lock account after MAX_LOGIN_ATTEMPTS. */
  async recordFailedLoginAttempt(
    userId: string,
    ip?: string,
    ua?: string,
  ): Promise<void> {
    const security = await this.prisma.authSecurity.findUnique({
      where: { userId },
      select: { failedAttempts: true },
    });

    const newAttempts = (security?.failedAttempts ?? 0) + 1;
    const lockExpiresAt =
      newAttempts >= this.maxLoginAttempts
        ? new Date(Date.now() + this.accountLockoutMinutes * 60 * 1000)
        : null;

    await this.prisma.authSecurity.upsert({
      where: { userId },
      update: {
        failedAttempts: newAttempts,
        lastFailedAt: new Date(),
        lockExpiresAt,
      },
      create: {
        userId,
        failedAttempts: newAttempts,
        lastFailedAt: new Date(),
        lockExpiresAt,
      },
    });

    void this.authQueue.addAuditLogJob({
      userId,
      action: 'AUTH_LOGIN_FAILED',
      status: AuditStatus.FAILURE,
      severity: lockExpiresAt ? AuditSeverity.HIGH : AuditSeverity.MEDIUM,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        failedAttempts: newAttempts,
        locked: Boolean(lockExpiresAt),
      },
    } as any);
  }




  async getMe(userId: string) {
    if (!userId) {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        publicId: true,
        name: true,
        email: true,
        emailVerified: true,
        status: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
