export class CreateDiaryRequest {
  peakDb: number;
  emoji: string;
  date: string;
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
  emoji: string;
  comment: string;
}
