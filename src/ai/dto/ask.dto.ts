import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const REPLY_STYLE_VALUES = [
  'default',
  'rigorous',
  'humorous',
  'concise',
  'detailed',
  'warm',
] as const;

export const CHAT_MODEL_IDS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'qwen-plus',
  'qwen-max',
  'qwen-vl-max',
] as const;

const IMAGE_MODEL_IDS = new Set<string>(['qwen-vl-max', 'qwen-vl-plus']);

export function modelSupportsImage(modelId?: string) {
  const normalized = (modelId || 'deepseek-v4-flash').trim().toLowerCase();
  return IMAGE_MODEL_IDS.has(normalized) || normalized.startsWith('qwen-vl');
}

export class AskDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MaxLength(8000)
  prompt!: string;

  @IsOptional()
  @IsBoolean()
  deepThinking?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  fileIds?: string[];

  @IsOptional()
  @IsIn(REPLY_STYLE_VALUES)
  replyStyle?: (typeof REPLY_STYLE_VALUES)[number];

  @IsOptional()
  @IsIn(CHAT_MODEL_IDS)
  modelId?: (typeof CHAT_MODEL_IDS)[number];
}
