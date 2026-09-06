import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePostDto {
  @ApiProperty({ required: false, description: 'Optional updated image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false, description: 'Optional updated caption' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;
}
