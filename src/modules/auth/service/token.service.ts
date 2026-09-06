import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CustomLoggerService } from '../../../common/logger/logger.service';
import { RedisService } from '../../../common/redis/services/redis.service';
import { randomUUID } from 'crypto';
import { JwtPayload, Tokens } from '../interfaces/tokens.interface';
import { Prisma } from '@/prisma/generated/prisma/client';
import { SecurityUtil } from '@/src/common/security/security.util';


@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: CustomLoggerService,
    private readonly redisService: RedisService,
  ) { }

  // ─── Generate Access + Refresh Token Pair ────────────────────────────────

  async getTokens(userId: string, tokenVersion: number, deviceId: string, family?: string): Promise<Tokens> {
    const jti = randomUUID();
    const tokenFamily = family ?? randomUUID();

    const jwtPayload: JwtPayload = {
      sub: userId,
      version: tokenVersion,
      deviceId,
      jti,
      family: tokenFamily,
    };

    const accessSecret = this.config.getOrThrow<string>('jwt.JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('jwt.JWT_REFRESH_SECRET');
    const accessExpiry = this.config.getOrThrow<string>('jwt.JWT_ACCESS_EXPIRES_IN');
    const refreshExpiry = this.config.getOrThrow<string>('jwt.JWT_REFRESH_EXPIRES_IN');
    const issuer = this.config.get<string>('jwt.JWT_ISSUER');
    const audience = this.config.get<string>('jwt.JWT_AUDIENCE');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(jwtPayload, {
        secret: accessSecret,
        expiresIn: accessExpiry as any,
        ...(issuer ? { issuer } : {}),
        ...(audience ? { audience } : {}),
      }),
      this.jwt.signAsync(jwtPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiry as any,
      }),
    ]);

    return { accessToken, refreshToken, jti, family: tokenFamily };
  }

  // ─── Upsert RefreshToken + Sync Session ────────────────────────────────────
  async handleSessionUpdate(
    userId: string,
    deviceId: string,
    refreshToken: string,
    jti: string,
    ip: string,
    ua: string | undefined,
    tx: Prisma.TransactionClient,
    family: string,
    previousJti?: string,
  ) {
    const hash = await SecurityUtil.hashData(refreshToken, false);
    const ttlDays = this.config.get<number>('jwt.REFRESH_TOKEN_TTL_DAYS', 7);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    const maxDevices = this.config.get<number>('device.MAX_DEVICES', 3);
    const userAgent = ua ?? 'UNKNOWN';

    // ── Enforce device limit ────────────────────────────────────────────────
    const activeSessions = await tx.refreshToken.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });

    const isNewDevice = !activeSessions.find((s) => s.deviceId === deviceId);

    if (isNewDevice && activeSessions.length >= maxDevices) {
      const oldest = activeSessions[0];

      await tx.refreshToken.update({
        where: { id: oldest.id },
        data: {
          isRevoked: true,
          revokeReason: 'MAX_DEVICES_REACHED',
          revokedAt: new Date(),
        },
      });
      await tx.session.updateMany({
        where: { userId, deviceId: oldest.deviceId || '', isActive: true },
        data: { isActive: false },
      });

      this.logger.warn(
        `[TokenService] Max devices reached for user ${userId}. Oldest device (${oldest.deviceId}) evicted.`,
      );
    }

    // ── Upsert RefreshToken ─────────────────────────────────────────────────
    await tx.refreshToken.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      update: {
        tokenHash: hash,
        jti,
        family,
        // Schema field name is rotatedFromId; value is the prior access/refresh JTI for this chain.
        rotatedFromId: previousJti ?? null,
        ipAddress: ip,
        userAgent,
        expiresAt,
        isRevoked: false,
        revokedAt: null,
        revokeReason: null,
      },
      create: {
        userId,
        deviceId,
        tokenHash: hash,
        jti,
        family,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });

    // ── Sync Session record ─────────────────────────────────────────────────
    await tx.session.upsert({
      where: { userId_deviceId: { userId, deviceId } }, // ← composite unique key
      update: {
        sid: jti,           // Update sid to the latest jti
        lastUsedAt: new Date(),
        isActive: true,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
      create: {
        userId,
        deviceId,
        sid: jti,
        ipAddress: ip,
        userAgent,
        expiresAt,
        isActive: true,
      },
    });
  }

  // ─── Refresh Token Rotation ─────────────────────────────────────────────────
  /**
   * Rotates refresh token with full breach detection:
   */
  async rotateRefreshToken(userId: string, deviceId: string, rt: string, ip: string, ua: string, tokenVersion: number,): Promise<Tokens> {
    const ipLimit = await this.redisService.rateLimit(`refresh-ip:${ip}`, 30, 3600);
    if (!ipLimit.allowed) {
      throw new ForbiddenException('Too many refresh attempts from this IP. Please try later.');
    }

    const userLimit = await this.redisService.rateLimit(
      `refresh-user:${userId}:${deviceId}`,
      20,
      3600,
    );
    if (!userLimit.allowed) {
      throw new ForbiddenException('Too many refresh attempts. Please try later.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Verify the incoming refresh token itself (signature + claims).
      // RtStrategy already validated the signature, but we also need the raw token's JTI/FAMILY
      // for breach detection (old token reuse) because we store only ONE row per device.
      const refreshSecret = this.config.getOrThrow<string>('jwt.JWT_REFRESH_SECRET');
      let rtPayload: JwtPayload;
      try {
        rtPayload = await this.jwt.verifyAsync<JwtPayload>(rt, {
          secret: refreshSecret,
          algorithms: ['HS256'],
        });
      } catch {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Payload integrity checks (defence-in-depth)
      if (
        rtPayload.sub !== userId ||
        rtPayload.deviceId !== deviceId ||
        rtPayload.version !== tokenVersion
      ) {
        throw new UnauthorizedException('Refresh token mismatch');
      }

      // ── 1. User check ───────────────────────────────────────────────────────
      const user = await tx.user.findUnique({
        where: { id: userId, status: 'ACTIVE' },
        select: { id: true, tokenVersion: true },
      });

      if (!user) throw new ForbiddenException('Access denied: User inactive or not found');
      if (user.tokenVersion !== tokenVersion) {
        this.logger.warn(
          `[TokenService] Token version mismatch for user ${userId}. Token invalidated.`,
        );
        throw new UnauthorizedException('Token invalidated. Please log in again.');
      }

      // ── 3. Stored token lookup ──────────────────────────────────────────────
      const storedToken = await tx.refreshToken.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });

      if (!storedToken) throw new UnauthorizedException('Session not found. Please log in.');

      // ── Old refresh token reuse detection (rotation hijack) ─────────────────
      // Because we upsert one row per device, we detect reuse by comparing the incoming
      // token's (family, jti) to the stored active token. A valid-signed token with the
      // same family but a different JTI means an older token is being replayed.
      if (rtPayload.family === storedToken.family && rtPayload.jti !== storedToken.jti) {
        this.logger.error(
          `[SECURITY BREACH] Refresh token reuse detected (family=${storedToken.family}) for user ${userId}. Nuking all sessions.`,
        );

        await Promise.all([
          tx.refreshToken.updateMany({
            where: { userId },
            data: {
              isRevoked: true,
              revokeReason: 'SECURITY_BREACH_REUSE',
              revokedAt: new Date(),
            },
          }),
          tx.session.updateMany({
            where: { userId },
            data: { isActive: false },
          }),
          tx.user.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
          }),
        ]);

        throw new ForbiddenException('Security breach detected. All sessions terminated.');
      }

      if (storedToken.isRevoked) {
        this.logger.error(
          `[SECURITY BREACH] Revoked token reuse detected for user ${userId}. Nuking all sessions.`,
        );

        await Promise.all([
          tx.refreshToken.updateMany({
            where: { userId },
            data: {
              isRevoked: true,
              revokeReason: 'SECURITY_BREACH_REUSE',
              revokedAt: new Date(),
            },
          }),
          tx.session.updateMany({
            where: { userId },
            data: { isActive: false },
          }),
          tx.user.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
          }),
        ]);

        throw new ForbiddenException('Security breach detected. All sessions terminated.');
      }

      // ── 6. Hash verification ────────────────────────────────────────────────
      const isValid = await SecurityUtil.compareData(rt, storedToken.tokenHash, false);
      if (!isValid) {
        this.logger.warn(`[TokenService] Invalid token fingerprint for user ${userId}`);
        throw new UnauthorizedException('Invalid token. Please log in again.');
      }

      // ── 7. Issue new token pair (preserve family) ───────────────────────────
      const tokens = await this.getTokens(
        userId,
        user.tokenVersion,
        deviceId,
        storedToken.family ?? undefined,
      );

      await this.handleSessionUpdate(
        userId,
        deviceId,
        tokens.refreshToken,
        tokens.jti,
        ip,
        ua,
        tx,
        storedToken.family || storedToken.jti,
        storedToken.jti,
      );

      return tokens;
    });
  }

  // ─── Revoke Single Device Session ──────────────────────────────────────────
  /**
   * Logout from a specific device — revokes token + deactivates session.
   */
  async revokeDeviceSession(
    userId: string,
    deviceId: string,
    reason = 'USER_LOGOUT',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.refreshToken.updateMany({
          where: { userId, deviceId },
          data: { isRevoked: true, revokeReason: reason, revokedAt: new Date() },
        }),
        tx.session.updateMany({
          where: { userId, deviceId },
          data: { isActive: false },
        }),
      ]);
    });
  }

  // ─── Revoke ALL Sessions (Global Logout) ───────────────────────────────────
  async revokeAllSessions(userId: string, reason = 'GLOBAL_LOGOUT'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.refreshToken.updateMany({
          where: { userId },
          data: { isRevoked: true, revokeReason: reason, revokedAt: new Date() },
        }),
        tx.session.updateMany({
          where: { userId },
          data: { isActive: false },
        }),
        tx.user.update({
          where: { id: userId },
          data: { tokenVersion: { increment: 1 } },
        }),
      ]);
    });

    this.logger.warn(`[TokenService] All sessions revoked for user ${userId}. Reason: ${reason}`);
  }

  // ─── List Active Sessions ───────────────────────────────────────────────────
  async getActiveSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, isActive: true, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }
}