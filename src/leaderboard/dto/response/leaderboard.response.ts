export class LeaderboardEntryResponse {
  constructor(
    public readonly rank: number,
    public readonly userId: number,
    public readonly nickname: string,
    public readonly avatarColor: string,
    public readonly bestDb: number,
    public readonly profileImageUrl: string | null,
  ) {}
}

export class GlobalLeaderboardResponse {
  constructor(
    public readonly entries: LeaderboardEntryResponse[],
    public readonly myEntry: LeaderboardEntryResponse | null,
  ) {}
}
