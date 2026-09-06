import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PostVisibility } from '@/prisma/generated/prisma/client';

export class UpdateVisibilityDto {
  @ApiProperty({
    enum: PostVisibility,
    description: 'Updated visibility setting',
  })
  @IsNotEmpty()
  @IsEnum(PostVisibility)
  visibility!: PostVisibility;
}
