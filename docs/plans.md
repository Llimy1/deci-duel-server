# DeciDuel 실행 계획

## Phase 1: 기본 기능 ✅ DONE
- [x] Auth (개발용 signup/login, refresh rotation, logout)
- [x] User Profile (GET /user/me, PATCH nickname/avatarColor, POST profile-image)
- [x] Solo Record (POST /solo/record, GET /solo/record)
- [x] Diary (CRUD by date)
- [x] Storage (Cloudflare R2 presigned URL)

## Phase 2: 실시간 대결 ✅ DONE
- [x] WebSocket GameGateway (/game namespace)
- [x] 3라운드 데시벨 대결 (5.5초 하이브리드 타이머)
- [x] 방 생성/참여 (6자리 랜덤 코드)
- [x] 재연결 지원 (5초 grace period, forfeit)
- [x] 승/패 DB 저장 (User.wins, User.losses)
- [x] 통합 테스트 107개

## Phase 3: 게임 이력 & 소셜
- [ ] GET /me/solo-records (페이지네이션 — HistoryScreen용)
- [ ] 매치 히스토리 (GameRecord 테이블 추가)
- [ ] 리더보드 (상위 N명 조회)
- [ ] streak 계산 로직

## 의존성
- Phase 3는 Phase 2 완료 후 진행
- 리더보드는 GameRecord가 선행되어야 함
