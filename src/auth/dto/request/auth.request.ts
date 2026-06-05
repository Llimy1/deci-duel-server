import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export type OAuthProvider = 'apple' | 'google' | 'kakao';

export class OAuthLoginRequest {
  @IsIn(['apple', 'google', 'kakao'])
  provider: OAuthProvider;

  @IsOptional()
  @IsString()
  idToken?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}

export class OAuthSignupRequest {
  @IsString()
  @MinLength(1)
  signupToken: string;

  @IsString()
  @MinLength(2)
  nickname: string;

  @IsString()
  @MinLength(1)
  termsVersion: string;

  @IsString()
  @MinLength(1)
  privacyVersion: string;
}

export class ExchangeAuthCodeRequest {
  @IsString()
  @MinLength(1)
  code: string;
}

export class RefreshRequest {
  @IsString()
  @MinLength(1, { message: '리프레시 토큰을 입력해주세요.' })
  refreshToken: string;
}
