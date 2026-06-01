export enum UserResponseMessage {
  NICKNAME_AVAILABLE = '사용가능한 닉네임입니다.',
  NICKNAME_ALREADY_EXISTS = '이미 사용 중인 닉네임입니다.',
  ME_SUCCESS = '내 프로필 조회에 성공했습니다.',
  NICKNAME_UPDATE_SUCCESS = '닉네임이 변경되었습니다.',
  AVATAR_COLOR_UPDATE_SUCCESS = '아바타 색상이 변경되었습니다.',
  PROFILE_IMAGE_UPDATE_SUCCESS = '프로필 이미지가 변경되었습니다.',
  DELETE_SUCCESS = '회원 탈퇴가 완료되었습니다.',
}

export enum AuthResponseMessage {
  SIGNUP_SUCCESS = '회원가입에 성공했습니다.',
  LOGIN_SUCCESS = '로그인에 성공했습니다.',
  REFRESH_SUCCESS = '토큰 재발급에 성공했습니다.',
  LOGOUT_SUCCESS = '로그아웃에 성공했습니다.',
}

export enum SoloRecordResponseMessage {
  SOLO_RECORD_CREATE_SUCCESS = '솔로 기록 저장에 성공했습니다.',
  FIND_SOLO_RECORD_DATA_SUCCESS = '솔로 기록 조회에 성공했습니다.',
}

export enum DiaryResponseMessage {
  DIARY_CREATE_SUCCESS = '다이어리 기록 생성에 성공했습니다.',
  DIARY_MONTHLY_SUCCESS = '월별 다이어리 조회에 성공했습니다.',
  DIARY_DATE_SUCCESS = '날짜별 다이어리 조회에 성공했습니다.',
  DIARY_UPDATE_SUCCESS = '다이어리 기록 수정에 성공했습니다.',
  DIARY_DELETE_SUCCESS = '다이어리 기록 삭제에 성공했습니다.',
}

export enum LeaderboardResponseMessage {
  GLOBAL_LEADERBOARD_SUCCESS = '글로벌 리더보드 조회에 성공했습니다.',
}

export enum ConsentResponseMessage {
  CONSENT_SUCCESS = '약관 동의가 저장되었습니다.',
}
