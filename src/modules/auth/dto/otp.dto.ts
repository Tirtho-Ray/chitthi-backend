import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { IsDeviceId } from '../utils/device-id.validator';

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'john@gmail.com' })
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').toLowerCase().trim())
  email!: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP', minLength: 6, maxLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;

  @IsDeviceId()
  deviceId!: string;
}

export class RequestPasswordResetOtpDto {
  @ApiProperty({ example: 'john@gmail.com' })
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').toLowerCase().trim())
  email!: string;
}

export class ResetPasswordWithOtpDto {
  @ApiProperty({ example: 'john@gmail.com' })
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').toLowerCase().trim())
  email!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;

  @ApiProperty({ example: 'NewStrongPass@456', minLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldStrongPass@123', minLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  oldPassword!: string;

  @ApiProperty({ example: 'NewStrongPass@456', minLength: 6 })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

