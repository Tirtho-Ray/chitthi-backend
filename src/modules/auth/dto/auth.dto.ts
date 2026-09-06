// import {
//     IsEmail,
//     IsString,
//     MinLength,
//     MaxLength,
//     IsOptional,
// } from 'class-validator';
// import { Transform } from 'class-transformer';
// import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// // ─── RegisterDto ──────────────────────────────────────────────────────────────
// export class RegisterDto {
//     @ApiProperty({ example: 'user@example.com', description: 'Valid email address' })
//     @IsEmail()
//     @Transform(({ value }) => value?.toLowerCase().trim())
//     email: string;

//     @ApiProperty({ example: 'StrongPass@123', description: 'Password (8–72 characters)', minLength: 8, maxLength: 72 })
//     @IsString()
//     @MinLength(8)
//     @MaxLength(72)
//     password: string;

//     @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Client-generated device UUID' })
//     @IsString()
//     deviceId: string;
// }

// // ─── LoginDto ─────────────────────────────────────────────────────────────────
// export class LoginDto {
//     @ApiProperty({ example: 'user@example.com' })
//     @IsEmail()
//     @Transform(({ value }) => value?.toLowerCase().trim())
//     email: string;

//     @ApiProperty({ example: 'StrongPass@123' })
//     @IsString()
//     password: string;

//     @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Device UUID for session tracking' })
//     @IsString()
//     deviceId: string;

//     @ApiPropertyOptional({ example: '123456', description: 'TOTP or recovery code — required only if MFA is enabled' })
//     @IsString()
//     @IsOptional()
//     mfaCode?: string;
// }

// // ─── ForgotPasswordDto ────────────────────────────────────────────────────────
// export class ForgotPasswordDto {
//     @ApiProperty({ example: 'user@example.com', description: 'Registered email to send reset OTP' })
//     @IsEmail()
//     @Transform(({ value }) => value?.toLowerCase().trim())
//     email: string;
// }

// // ─── ResetPasswordDto ─────────────────────────────────────────────────────────
// export class ResetPasswordDto {
//     @ApiProperty({ example: 'user@example.com' })
//     @IsEmail()
//     @Transform(({ value }) => value?.toLowerCase().trim())
//     email: string;

//     @ApiProperty({ example: '482910', description: '6-digit OTP sent to email', minLength: 6, maxLength: 6 })
//     @IsString()
//     @MinLength(6)
//     @MaxLength(6)
//     otp: string;

//     @ApiProperty({ example: 'NewStrongPass@456', description: 'New password — cannot reuse last 5', minLength: 8, maxLength: 72 })
//     @IsString()
//     @MinLength(8)
//     @MaxLength(72)
//     newPassword: string;
// }

// // ─── VerifyOtpDto ─────────────────────────────────────────────────────────────
// export class VerifyOtpDto {
//     @ApiProperty({ example: '748291', description: '6-digit email verification OTP', minLength: 6, maxLength: 6 })
//     @IsString()
//     @MinLength(6)
//     @MaxLength(6)
//     otp: string;
// }

// // ─── Response schemas (used in @ApiResponse) ──────────────────────────────────
// export class AuthSuccessResponse {
//     @ApiProperty({ example: 'Registration successful. Please verify your email.' })
//     message: string;

//     @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
//     deviceId: string;
// }

// export class MessageResponse {
//     @ApiProperty({ example: 'Operation successful' })
//     message: string;
// }

// export class SessionResponse {
//     @ApiProperty({ example: 'uuid-string' })
//     id: string;

//     @ApiProperty({ example: 'device-uuid' })
//     deviceId: string;

//     @ApiPropertyOptional({ example: 'Chrome on Windows' })
//     deviceName?: string;

//     @ApiPropertyOptional({ example: '192.168.1.1' })
//     ipAddress?: string;

//     @ApiPropertyOptional({ example: 'Mozilla/5.0...' })
//     userAgent?: string;

//     @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
//     lastUsedAt: Date;

//     @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
//     createdAt: Date;
// }