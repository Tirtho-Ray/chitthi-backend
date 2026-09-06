import { Body, Controller, Post, HttpCode, HttpStatus, Res, Get, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Response, Request, CookieOptions } from 'express';
import { AuthService } from '../service/auth.service';
import { TokenService } from '../service/token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Public } from '../../../core/jwt/public.decorator';
import { ConfigService } from '@nestjs/config';
import { DeviceInfo, GetDeviceInfo } from '../utils/device-info.decorator';
import { JwtPayload } from '../interfaces/tokens.interface';
import { AtGuard } from '../../../core/jwt/at.guard';
import { RtGuard } from '../../../core/jwt/rt.guard';
import { GetUser } from '../../../core/jwt/get-user.decorator';
import { LogoutDto } from '../dto/logout.dto';
import { randomUUID } from 'crypto';
import { ChangePasswordDto, RequestPasswordResetOtpDto, ResetPasswordWithOtpDto, VerifyEmailOtpDto } from '../dto/otp.dto';
import { CsrfGuard } from '../utils/csrf.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) { }

  // ─── SIGNUP ───────────────────────────────────────────────────────────────
  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user', description: 'Creates account, sends email verification OTP, sets auth cookies.' })
  @ApiBody({ type: RegisterDto })
  async signup(
    @Body() dto: RegisterDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.signup(dto, deviceInfo.ip, deviceInfo.userAgent);
    // No session until OTP verification succeeds.
    this.clearCookies(res);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'OTP sent. Please verify to activate your account.'
    };
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email OTP', description: 'Activates pending account and issues tokens.' })
  @ApiBody({ type: VerifyEmailOtpDto })
  async verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ statusCode: number; message: string }> {
    const tokens = await this.authService.verifyEmailOtp({
      email: dto.email,
      otp: dto.otp,
      deviceId: dto.deviceId,
      ip: deviceInfo.ip,
      ua: deviceInfo.userAgent ?? '',
    });
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    return {
      statusCode: HttpStatus.OK,
      message: 'Email verified. Login successful.'
    };
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login', description: 'Returns tokens and sets auth cookies.' })
  @ApiBody({ type: LoginDto })
  async login(
    @Body() dto: LoginDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ statusCode: number; message: string }> {
    const tokens = await this.authService.login(dto, deviceInfo.ip, deviceInfo.userAgent);
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    return {
      statusCode: HttpStatus.OK,
      message: 'Login successful.'
    };
  }

  // ─── FORGOT PASSWORD ─────────────────────────────────────────────────────
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset OTP', description: 'Sends 1-minute OTP if the user exists.' })
  @ApiBody({ type: RequestPasswordResetOtpDto })
  async forgotPassword(
    @Body() dto: RequestPasswordResetOtpDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
  ) {
    await this.authService.requestPasswordResetOtp(dto.email, deviceInfo.ip);
    return {
      statusCode: HttpStatus.OK,
      message: 'If the account exists, an OTP has been sent.'
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP', description: 'Verifies OTP and sets a new password. Revokes all sessions.' })
  @ApiBody({ type: ResetPasswordWithOtpDto })
  async resetPassword(
    @Body() dto: ResetPasswordWithOtpDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
  ) {
    await this.authService.resetPasswordWithOtp({
      email: dto.email,
      otp: dto.otp,
      newPassword: dto.newPassword,
      ip: deviceInfo.ip,
      ua: deviceInfo.userAgent ?? '',
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Password updated. Please login again.'
    };
  }

  // ─── CHANGE PASSWORD ─────────────────────────────────────────────────────
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password', description: 'Changes password for logged in user.' })
  @ApiCookieAuth()
  @ApiBearerAuth()
  @UseGuards(CsrfGuard)
  async changePassword(
    @GetUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword({
      userId,
      oldPassword: dto.oldPassword,
      newPassword: dto.newPassword,
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Password changed successfully.',
    };
  }

  // ─── REFRESH ──────────────────────────────────────────────────────────────
  @Public()
  @UseGuards(RtGuard, CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh tokens', description: 'Rotates refresh token and returns a new token pair.' })
  @ApiCookieAuth()
  @ApiBearerAuth()
  async refresh(
    @Req() req: Request,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ statusCode: number; message: string }> {
    const payload = req.user as any as JwtPayload & { refreshToken: string };
    const tokens = await this.tokenService.rotateRefreshToken(
      payload.sub,
      payload.deviceId,
      payload.refreshToken,
      deviceInfo.ip,
      deviceInfo.userAgent ?? '',
      payload.version,
    );
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    return {
      statusCode: HttpStatus.OK,
      message: 'Tokens refreshed successfully.'
    };
  }

  // ─── LOGOUT (single device) ───────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout current device', description: 'Revokes current device session and clears cookies.' })
  @ApiCookieAuth()
  @ApiBearerAuth()
  @UseGuards(CsrfGuard)
  async logout(
    @GetUser('id') userId: string,
    @GetUser('deviceId') tokenDeviceId: string,
    @Body() dto: LogoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceId = dto.deviceId ?? tokenDeviceId;
    await this.tokenService.revokeDeviceSession(userId, deviceId, 'USER_LOGOUT');
    this.clearCookies(res);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logged out successfully.'
    };
  }

  // ─── LOGOUT ALL ───────────────────────────────────────────────────────────
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout all sessions', description: 'Revokes all sessions for the user (tokenVersion++) and clears cookies.' })
  @ApiCookieAuth()
  @ApiBearerAuth()
  @UseGuards(CsrfGuard)
  async logoutAll(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.tokenService.revokeAllSessions(userId, 'GLOBAL_LOGOUT');
    this.clearCookies(res);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logged out from all devices.'
    };
  }

  // ─── ME ───────────────────────────────────────────────────────────────────
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user', description: 'Returns identity from the validated access token.' })
  @ApiCookieAuth()
  @ApiBearerAuth()
  @UseGuards(AtGuard)
  async me(@GetUser('id') userId: string) {
    const userDetails = await this.authService.getMe(userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'User profile retrieved.',
      data: userDetails
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private setCookies(res: Response, access: string, refresh: string) {
    const isProd = this.getIsProd();
    const accessMaxAge = Number(this.config.get('jwt.JWT_ACCESS_EXPIRES_MS')) || 900_000;
    const refreshMaxAge = Number(this.config.get('jwt.JWT_REFRESH_EXPIRES_MS')) || 604_800_000;
    const csrfToken = randomUUID();

    const common: CookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
    };

    res.cookie('access_token', access, { ...common, maxAge: accessMaxAge });
    res.cookie('refresh_token', refresh, { ...common, maxAge: refreshMaxAge, path: '/' });
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
      maxAge: refreshMaxAge,
    });
  }

  private clearCookies(res: Response) {
    const isProd = this.getIsProd();
    const common: CookieOptions = { httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax', path: '/' };
    res.clearCookie('access_token', common);
    res.clearCookie('refresh_token', common);
    res.clearCookie('csrf_token', {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
    });
  }

  private getIsProd() {
    return (
      this.config.get<string>('node_env') === 'production' ||
      this.config.get<string>('NODE_ENV') === 'production'
    );
  }
}
