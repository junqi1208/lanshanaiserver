import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: 'male' | 'female' | 'unknown';

  @IsOptional()
  @IsString()
  avatar?: string;
}

