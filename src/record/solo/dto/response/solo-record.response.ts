export class CreateSoloRecordResponse {
  constructor(public readonly success: boolean) {}
}

export class FindSoloRecordResponse {
  constructor(
    public readonly peakDb: number,
    public readonly bestDb: number,
  ) {}
}
