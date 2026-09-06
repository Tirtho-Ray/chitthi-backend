import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PostVisibility } from '@/prisma/generated/prisma/client';

export class CreatePostDto {
  @ApiProperty({ required: false, description: 'Optional image URL for the post' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false, description: 'Optional caption/text content' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @ApiProperty({
    enum: PostVisibility,
    default: PostVisibility.PUBLIC,
    description: 'Post visibility setting',
  })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility = PostVisibility.PUBLIC;
}
