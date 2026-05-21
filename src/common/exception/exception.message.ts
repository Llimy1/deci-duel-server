export enum AuthExceptionMessage {
  USER_NOT_FOUND = '존재하지 않는 계정입니다',
  INVALID_PASSWORD = '비밀번호가 틀렸습니다',
  INVALID_TOKEN = '유효하지 않은 토큰입니다',
  DUPLICATE_ID = '이미 사용 중인 아이디입니다.',
}

export enum UserExceptionMessage {
  NICKNAME_REQUIRED = '닉네임을 입력해주세요.',
}

export enum DiaryExceptionMessage {
  DIARY_NOT_FOUND = '해당 날짜의 다이어리 기록이 없습니다.',
}
