import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, MaxLength, MinLength } from 'class-validator';
import { IsDeviceId } from '../utils/device-id.validator';

export class RegisterDto {
  @ApiProperty({
    example: 'johndeo',
    description: 'Name',
  })
  @IsNotEmpty()
  name!: string;
  @ApiProperty({
    example: 'john@gmail.com',
    description: 'Valid email address',
  })
  @IsEmail()
  @Transform(({ value }) => String(value ?? '').toLowerCase().trim())
  email!: string;

  @ApiProperty({
    example: 'strongPassword123',
    description: 'Password (min 6 characters)',
  })
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(15)
  password!: string;

  @IsDeviceId()
  deviceId!: string;
}
