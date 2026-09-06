import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, MaxLength } from 'class-validator';

/** Client device identifier must be a UUID v4 to prevent session slot hijacking. */
export function IsDeviceId() {
  return applyDecorators(
    ApiProperty({
      example: '550e8400-e29b-41d4-a716-446655440000',
      description: 'Unique device identifier (UUID v4)',
    }),
    IsNotEmpty(),
    IsUUID('4'),
    MaxLength(36),
  );
}
