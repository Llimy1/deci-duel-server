import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class DevSignupRequest {
  @IsString()
  @MinLength(4, { message: '아이디는 4자 이상이어야 합니다.' })
  @MaxLength(20, { message: '아이디는 20자 이하여야 합니다.' })
  id: string;

  @IsString()
  @MinLength(6, { message: '비밀번호는 6자 이상이어야 합니다.' })
  @MaxLength(50, { message: '비밀번호는 50자 이하여야 합니다.' })
  password: string;

  @IsString()
  @MinLength(2, { message: '닉네임은 2자 이상이어야 합니다.' })
  @MaxLength(12, { message: '닉네임은 12자 이하여야 합니다.' })
  @Matches(/^[가-힣a-zA-Z0-9]+$/, { message: '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.' })
  nickname: string;

  @IsString()
  @MinLength(1)
  termsVersion: string;

  @IsString()
  @MinLength(1)
  privacyVersion: string;
}

export class DevLoginRequest {
  @IsString()
  @MinLength(1, { message: '아이디를 입력해주세요.' })
  id: string;

  @IsString()
  @MinLength(1, { message: '비밀번호를 입력해주세요.' })
  password: string;
}

export class RefreshRequest {
  @IsString()
  @MinLength(1, { message: '리프레시 토큰을 입력해주세요.' })
  refreshToken: string;
}
