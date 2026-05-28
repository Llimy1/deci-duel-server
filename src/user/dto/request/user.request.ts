import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class UpdateNicknameRequest {
  @IsString()
  @MinLength(2, { message: '닉네임은 2자 이상이어야 합니다.' })
  @MaxLength(12, { message: '닉네임은 12자 이하여야 합니다.' })
  @Matches(/^[가-힣a-zA-Z0-9]+$/, { message: '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.' })
  nickname: string;
}

export class UpdateAvatarColorRequest {
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: '올바른 색상 코드를 입력해주세요. (#RRGGBB)' })
  avatarColor: string;
}
