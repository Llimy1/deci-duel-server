export class CreateDiaryResponse {
  constructor(public readonly success: boolean) {}
}

export class DiaryEntryResponse {
  constructor(
    public readonly date: string,
    public readonly peakDb: number,
    public readonly emoji: string,
    public readonly comment: string | null,
  ) {}
}

export class FindMonthlyDiaryResponse {
  constructor(public readonly entries: DiaryEntryResponse[]) {}
}

export class UpdateDiaryResponse {
  constructor(public readonly success: boolean) {}
}

export class DeleteDiaryResponse {
  constructor(public readonly success: boolean) {}
}

export class FindDiaryByDateResponse {
  constructor(
    public readonly date: string,
    public readonly peakDb: number,
    public readonly emoji: string,
    public readonly comment: string | null,
  ) {}
}
