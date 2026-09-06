import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateReplyDto {
  @ApiProperty({ example: 'I agree with this point.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  content!: string;
}
