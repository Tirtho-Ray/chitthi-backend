import { IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Device identifier to logout. If omitted, uses deviceId from access token.',
  })
  @IsOptional()
  @IsUUID('4')
  @MaxLength(36)
  deviceId?: string;
}

