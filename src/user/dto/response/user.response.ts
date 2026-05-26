export class NicknameCheckResponse {
  constructor(public readonly available: boolean) {}
}

export class MeResponse {
  constructor(
    public readonly id: number,
    public readonly nickname: string,
    public readonly avatarColor: string,
    public readonly profileImageUrl: string | null,
    public readonly streak: number,
    public readonly wins: number,
    public readonly losses: number,
    public readonly bestDb: number,
    public readonly createdAt: string,
  ) {}
}

export class UpdateNicknameResponse {
  constructor(public readonly nickname: string) {}
}

export class UpdateAvatarColorResponse {
  constructor(public readonly avatarColor: string) {}
}

export class UpdateProfileImageResponse {
  constructor(public readonly profileImageUrl: string) {}
}
