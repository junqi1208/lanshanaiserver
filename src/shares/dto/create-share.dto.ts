import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateShareDto {
  @IsString()
  conversationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  groupIds!: string[];
}

