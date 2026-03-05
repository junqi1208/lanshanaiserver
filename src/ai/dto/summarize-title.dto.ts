import { IsString, IsUUID } from 'class-validator';

export class SummarizeTitleDto {
  @IsUUID()
  @IsString()
  conversationId!: string;
}

