import { IsIn, IsString, MaxLength } from 'class-validator';

export class AddMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content!: string;
}

