import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminLoginRequest {
  @IsString()
  @MinLength(1)
  code: string;
}

const EVENT_LEVELS = ['info', 'warn', 'error'] as const;
const EVENT_CATEGORIES = ['auth', 'admin', 'http', 'socket', 'game', 'system', 'storage'] as const;

export class AdminEventsQuery {
  @IsOptional()
  @IsIn(EVENT_LEVELS)
  level?: (typeof EVENT_LEVELS)[number];

  @IsOptional()
  @IsIn(EVENT_CATEGORIES)
  category?: (typeof EVENT_CATEGORIES)[number];

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cursor?: number;
}
