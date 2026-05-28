import { IsNumber, Min, Max } from 'class-validator';

export class CreateSoloRecordRequest {
  @IsNumber({}, { message: 'peakDb는 숫자여야 합니다.' })
  @Min(0, { message: 'peakDb는 0 이상이어야 합니다.' })
  @Max(200, { message: 'peakDb는 200 이하여야 합니다.' })
  peakDb: number;
}
