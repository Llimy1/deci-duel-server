export enum AuthExceptionMessage {
  USER_NOT_FOUND = '존재하지 않는 계정입니다',
  INVALID_PASSWORD = '비밀번호가 틀렸습니다',
  INVALID_TOKEN = '유효하지 않은 토큰입니다',
  DUPLICATE_ID = '이미 사용 중인 아이디입니다.',
}

export enum UserExceptionMessage {
  NICKNAME_REQUIRED = '닉네임을 입력해주세요.',
  NICKNAME_TOO_SHORT = '닉네임은 2자 이상이어야 합니다.',
  NICKNAME_INVALID_CHARS = '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.',
  NICKNAME_ALREADY_EXISTS = '이미 사용 중인 닉네임입니다.',
  AVATAR_COLOR_INVALID = '올바른 색상 코드를 입력해주세요. (#RRGGBB)',
  PROFILE_IMAGE_INVALID_TYPE = '이미지 파일만 업로드 가능합니다. (jpeg, png, webp)',
  PROFILE_IMAGE_TOO_LARGE = '이미지 파일 크기는 5MB 이하여야 합니다.',
}

export enum DiaryExceptionMessage {
  DIARY_NOT_FOUND = '해당 날짜의 다이어리 기록이 없습니다.',
}
