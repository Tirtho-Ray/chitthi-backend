import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Great post, thanks for sharing!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  content!: string;
}
