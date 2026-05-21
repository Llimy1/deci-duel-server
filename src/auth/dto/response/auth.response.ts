export class AuthTokenResponse {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly user: { id: number; nickname: string },
  ) {}
}

export class DevSignupResponse extends AuthTokenResponse {}
export class DevLoginResponse extends AuthTokenResponse {}
export class RefreshResponse extends AuthTokenResponse {}
