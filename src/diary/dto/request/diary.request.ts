import {
  IsNumber,
  IsString,
  Min,
  Max,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';

export class CreateDiaryRequest {
  @IsNumber({}, { message: 'peakDb는 숫자여야 합니다.' })
  @Min(0, { message: 'peakDb는 0 이상이어야 합니다.' })
  @Max(200, { message: 'peakDb는 200 이하여야 합니다.' })
  peakDb: number;

  @IsString()
  @MaxLength(16, { message: '이모지는 16자 이하여야 합니다.' })
  emoji: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜 형식은 YYYY-MM-DD여야 합니다.' })
  date: string;

  @IsString()
  @MaxLength(200, { message: '코멘트는 200자 이하여야 합니다.' })
  @IsOptional()
  comment: string;
}

export class FindMonthlyDiaryRequest {
  year: number;
  month: number;
}

export class FindDiaryByDateRequest {
  date: string;
}

export class UpdateDiaryRequest {
  @IsString()
  @MaxLength(16, { message: '이모지는 16자 이하여야 합니다.' })
  emoji: string;

  @IsString()
  @MaxLength(200, { message: '코멘트는 200자 이하여야 합니다.' })
  @IsOptional()
  comment: string;
}
