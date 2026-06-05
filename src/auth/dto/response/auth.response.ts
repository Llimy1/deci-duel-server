import type { OAuthProvider } from '../request/auth.request';

export class AuthTokenResponse {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly user: { id: number; nickname: string },
  ) {}
}

export class OAuthExistingUserResponse extends AuthTokenResponse {
  readonly isNewUser = false as const;
}

export class OAuthNewUserResponse {
  readonly isNewUser = true as const;
  constructor(
    public readonly signupToken: string,
    public readonly provider: OAuthProvider,
  ) {}
}

export type OAuthLoginResponse = OAuthExistingUserResponse | OAuthNewUserResponse;

export class OAuthSignupResponse extends AuthTokenResponse {
  readonly isNewUser = true as const;
}

export class RefreshResponse extends AuthTokenResponse {}
