import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AskDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MaxLength(8000)
  prompt!: string;
}

