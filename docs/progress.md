# 진행 상황

## 마지막 업데이트
2026-06-08 (Observability + Admin MVP — Codex 리뷰 6건 수정 세션)

## 현재 상태
Phase 2 완료 + WebSocket 이벤트 확장 완료 + 리더보드(Phase 3 일부) 완료.
방장(isHost) 설계 재정의 + 구현 완료. OAuth 네이티브 SDK 전환 완료.
**Codex 지시서 — Server Observability(Phase 1) + Admin Auth/API MVP(Phase 2) 구현 완료** (requestId, 구조화 로깅, OperationalEvent, Admin 모듈).
**Codex 코드리뷰 [2026-06-07 21:20] 6항목 점검 완료** — 5항목(request context actor 반영, ADMIN_JWT_SECRET fail-closed, .env.example 정리, check_db.ts 삭제, pino-http 제거)은 완전 해결. Jest open-handle 경고는 진짜 root cause 2건(pino-pretty worker thread, game.gateway 추적 안 되던 setTimeout 체인)을 찾아 수정했으나 경고 자체는 socket.io+Jest 통합테스트 하네스 teardown 타이밍 문제로 잔존 — Codex가 [2026-06-08 09:00]에 이미 "보류" 결정한 항목과 일치 (상세는 `CLAUDE_TO_CODEX.md` 완료 보고서 참고).
Phase A(정리/제거) 완료.
**Admin SPA 1차 구현 완료** (Codex `[2026-06-08 09:00] implementation-direction` 4단계 전부):
신규 레포 `deci-duel-web`(`https://github.com/Llimy1/deci-duel-web.git`, 로컬
`/Users/iminhyeog/dev/deci-duel-web`, Vite + React + TS)에 ① 로그인(접속코드→admin JWT,
sessionStorage) ② Dashboard/Health(`GET /admin/health` 카드뷰+폴링) ③ Events 뷰어
(`GET /admin/events` 필터+커서 페이지네이션+metadata JSON) ④ 정적 공개 페이지
(`/legal/terms`/`/legal/privacy`/`/legal/admob`, 본문은 placeholder) 구현 완료.
`tsc -b`/`vite build`/`eslint` 모두 통과, 서버 API 계약 변경 없음(`docs/api.md` 동기화 불필요).
상세는 `deci-duel-web/docs/progress.md` 참고. 남은 작업: Cloudflare Pages 배포 파이프라인,
서버 측 CORS 화이트리스트(Admin SPA 도메인) 추가, 약관/개인정보/AdMob 본문(법무 검토 후).

## 완료된 작업
- **Observability + Admin MVP (2026-06-07, Codex 지시서)**
  - requestId/`AsyncLocalStorage` 컨텍스트 (`RequestContextMiddleware`, `request-context.ts`) — 모든 요청에 `req_<uuid>` 부여, `x-request-id` 응답 헤더 echo, `ApiResponse`/예외 필터에 자동 포함
  - pino 기반 구조화 로깅 (`AppLogger`, `pino.instance.ts`) — requestId/userId 자동 첨부, HTTP access log, verbose→trace 매핑
  - `OperationalEvent` Prisma 모델 + 마이그레이션(`20260607104635_add_operational_events`) + 서비스 (`record`/`findMany`, 절대 throw 안 함, `sanitizeMetadata`로 토큰/시크릿 redaction)
  - `GameGateway`/`AuthService` 등에 OperationalEvent 계측 와이어링 (socket/game 라이프사이클 이벤트 14종)
  - Admin 모듈: `POST /admin/auth/login`(접속 코드 + rate limit), `GET /admin/health`, `GET /admin/events` — 일반 유저 JWT와 완전 분리된 admin JWT (`AdminJwtStrategy`/`AdminJwtGuard`)
  - 신규 spec 8개 + 기존 spec 3개 수정, 총 66+ 테스트 케이스 추가 (전체 204/204 통과, build 통과)
  - `docs/api.md`/`.env.example`/`CLAUDE_TO_CODEX.md` 동기화 완료
- Phase 1: Auth, User Profile, SoloRecord, Diary, Storage(R2)
- Phase 2: WebSocket GameGateway, 통합 테스트
- Phase 2 확장 (2026-05-28): Codex 요청 4건 구현
  - `opponent:ready` 이벤트
  - `round:db` → `opponent:db` 실시간 스트림
  - `bestDb` in `room:joined`/`opponent:joined`
  - 재대결 시스템 (`game:rematch`, `rematch:waiting`, `rematch:matched`)
  - forfeit 5초 → 10초, 방 TTL 10분
  - `game_over`/`rematch_waiting` 제3자 입장 허용
  - `docs/api.md` WebSocket 섹션 추가
- 리더보드 (2026-05-28): `GET /leaderboard/global`
  - `src/leaderboard/` 모듈 신규 생성 (controller/service/repository/dto)
  - top 50 bestDb DESC + myEntry(기록 없어도 항상 반환) 반환
  - `docs/api.md` 리더보드 섹션 추가
- 문서 정리 (2026-05-30)
  - `docs/api.md` 리더보드 스펙 정정 (top 50, myEntry 항상 반환)
  - `CLAUDE_TO_CODEX.md` Codex 질문 8개 답변 추가
- 친구 대결 버그 수정 (2026-05-30 세션)
  - **서버** `game.gateway.ts`
    - `room:join` slotCheckStates에 `'ready'` 추가 — 리매치 후 ready 상태에서 새 플레이어 입장 허용
    - `game:rematch` rematchAllowed에 `'waiting'` 추가 — 상대 먼저 나가서 waiting 된 경우 허용
  - **앱** `useMicDb.ts`
    - `start` deps `[hasPermission]` → `[]` — `hasPermissionRef` 패턴으로 Android 두 번째 게임 측정 안정화
  - **앱** `gameStore.ts`
    - `round:start` 핸들러에 `rematchMatchedAt: null` 추가 — stale timestamp 방지
  - **앱** `GameResultScreen.tsx`
    - `handledRematchAt = useRef(rematchMatchedAt)` — 마운트 시점 값으로 초기화, 잔여 timestamp 즉시 발동 방지
    - `beforeRemove` 리스너 추가 — 안드로이드 백 버튼/iOS 스와이프 백 시 `leaveRoom()` 호출
  - **앱** `MatchFoundScreen.tsx`
    - `beforeRemove` 리스너 + `hasNavigatedAway` ref 패턴 적용
  - **앱** `WaitingRoomScreen.tsx`
    - `beforeRemove` 리스너 + `hasNavigatedAway` ref 패턴 적용
  - **앱** `DuelLobbyScreen.tsx`
    - `navigation.isFocused()` → `isFocusedRef` (useFocusEffect 기반) 교체 — Modal 열린 상태에서 false 반환 문제 해결
    - 방 입장 성공 시 코드 입력 초기화 (`setCode('')`)

- 방장(isHost) 설계 + 구현 완료 (2026-05-30 세션)
  - **서버** `game.types.ts`: `PlayerInfo`에 `isHost: boolean` 추가
  - **서버** `game.gateway.ts`:
    - `room:create`: `isHost: true`
    - `room:join`: `room.players.size >= 2` 단순화, 입장자 `isHost: false`, payload에 `isHost` 포함
    - `room:leave` 비활성 경로: `wasHost` 판단 후 남은 플레이어에게 `room:host_transferred` 또는 `opponent:left` 분기
    - `tryReconnect`: 비활성 상태(`waiting`/`game_over`)에서는 재연결 대신 조용히 제거
  - **앱** `gameStore.ts`: `isHost`, `goToWaitingRoom` 상태 + `clearGoToWaitingRoom` 액션 추가, `opponent:left`/`room:host_transferred` 핸들러 추가
  - **앱** `MatchFoundScreen.tsx`: `goToWaitingRoom` 신호 구독 + `mountedFinalResult` ref 패턴으로 stale finalResult 방지
  - **앱** `WaitingRoomScreen.tsx`: `goToWaitingRoom` 소비 (navigate 없이 플래그만 초기화)
  - **앱** `GameResultScreen.tsx`: `rematch:waiting` status 감시 → `goToWaitingRoom` 신호로 교체
  - **앱** `DuelLobbyScreen.tsx`: `useFocusEffect`에서 `lastNavigationKey.current = null` 리셋 추가

- Phase A 정리/제거 완료 (2026-05-31)
  - **서버** `game.gateway.ts`: game:over/forfeit 시 wins/losses DB 저장 제거
  - **앱** `ProfileScreen`: wins/losses/streak/승률 통계 UI 제거, bestDb 한 줄 표시로 대체
  - **앱** `HistoryScreen` / `AchievementsScreen` / `DailyChallengeScreen`: "랜덤 매칭 이후 업데이트 예정" 준비 중 화면으로 교체
  - **앱** `FriendsScreen` 삭제 + `RankingStackParamList`에서 제거
  - **앱** `MatchingScreen` 삭제 + `GameStackParamList`에서 제거
  - **앱** 레거시 4개 삭제 (`CountdownScreen`, `MeasureScreen`, `RoundBreakScreen`, `ResultScreen`) + `HomeStackParamList`에서 제거
  - **앱** `HomeScreen`: streak 칩 제거, 데일리 챌린지 카드 제거
  - `npx tsc --noEmit` 앱/서버 모두 통과

## 진행 중인 작업
- Phase B 앱 완성도 작업 예정

## 출시 전 작업 로드맵

### Phase A — 정리/제거 (서버 + 앱) ✅ 완료
- [x] 방장(isHost) 설계 + 구현 완료
- [x] 서버: game:over/forfeit 시 wins/losses 저장 제거
- [x] 앱: ProfileScreen 승패/승률/연승 통계 UI 제거
- [x] 앱: AchievementsScreen → "준비 중" 화면
- [x] 앱: HistoryScreen → "준비 중" 화면
- [x] 앱: DailyChallengeScreen → "준비 중" 화면
- [x] 앱: FriendsScreen 삭제 + RankingTab 단순화
- [x] 앱: MatchingScreen 삭제 + HomeScreen 데일리챌린지 카드 제거
- [x] 앱: 레거시 화면 4개 삭제 (Countdown/Measure/RoundBreak/Result)

### Phase B — 앱 완성도
- [ ] 앱: i18n 다국어 지원 (한국어/영어)
  - `i18next` + `react-i18next` + `expo-localization`
  - 기기 언어 자동 감지 + 설정에서 수동 변경
  - 모든 UI 텍스트 `ko.json` / `en.json` 분리
  - 서버 응답 메시지는 앱에서 코드 기반으로 번역 처리 (서버 변경 불필요)
- [ ] 앱: 폰트 전체 통일 (시스템 폰트 혼용 제거)
- [ ] 앱: 톤/분위기 위화감 제거 (화면 간 일관성)
- [ ] 앱: 이모지 다양화 (다이어리 바텀시트 등) → 구현 시 방향 재논의 (Lottie vs Fluent Emoji vs 커스텀)
- [ ] 앱+서버: 데일리 챌린지 실내용 채우기 (서버 관리 vs 앱 로컬 결정 필요)
  - 아이디어: 오늘의 목표 dB 달성, 최고기록 갱신, 측정 3회 이상 등
- [ ] 앱: 효과음 추가 (카운트다운 3-2-1, 라운드 결과 승/패)
  - 배경음악은 dB 측정 게임 특성상 측정값에 영향 → 배경음악 미포함 결정
- [ ] 앱: 햅틱 추가 (카운트다운 각 숫자, 게임 시작, 라운드 결과)
- [ ] 앱: 마이크 권한 사전 안내 화면 (시스템 권한 요청 전 왜 필요한지 설명)
- [ ] 앱: 마이크 권한 거부 시 재유도 처리
- [ ] 앱: 온보딩 스와이프 카드 (첫 설치 1회)
  - 1장: DeciDuel 소개 (소리로 겨루는 게임)
  - 2장: 솔로 측정 방법
  - 3장: 친구와 대결 방법
  - 4장: 리더보드/랭킹 소개
- [ ] 앱: 오프라인/네트워크 에러 처리
- [ ] 앱: 딥링크 (방코드 공유 시 앱 자동 실행 + 코드 자동 입력)

### Phase C — 법적/배포 준비
- [ ] 웹: 개인정보처리방침 페이지 (AdMob 심사 + 앱스토어 필수)
- [ ] 웹: 이용약관 페이지
- [ ] 앱: 약관 동의 플로우 (첫 가입 시)
- [ ] 앱: 버전 표시, 이용약관/개인정보처리방침 링크 (SettingsScreen)
- [ ] 앱: 로그아웃/회원탈퇴 QA
- [ ] 앱: 앱 아이콘 & 스플래시 스크린 실제 디자인 교체

### Phase D — 배포
- [ ] 서버+앱: OAuth 구현 (Apple 필수 + Google + 카카오)
  - EAS/TestFlight 단계에선 개발자 로그인 유지
  - 실제 앱스토어 배포 시 개발자 Auth 제거
- [ ] 앱: Google AdMob 연동
  - 배너: 홈, 리더보드, 프로필 (게임 외 화면)
  - 전면: 게임 결과 화면 이후
  - 보상형: 나중에 번개 충전용으로 예약
  - 측정 중/게임 중/카운트다운 중 광고 배제
- [ ] 웹: 웹사이트 구축 (AdMob 크롤링 + 약관 호스팅)
- [ ] 서버: 프로덕션 배포 (Railway 또는 fly.io)
- [ ] 앱: EAS 빌드 + TestFlight 배포

## 랜덤 매칭 이후 (나중에)
- GameRecord 테이블 + 매치 히스토리
- HistoryScreen 실데이터 연결
- wins/losses/streak 자동 계산
- AchievementsScreen 실데이터 (업적 시스템)
- 번개 크레딧 시스템 + 보상형 광고 연동
- Matchmaking Queue (랜덤 매칭)
- FriendsScreen 친구 시스템

## 다음 세션 시작 시 할 일
1. claude-brain get_context(['nestjs', 'typescript', 'postgresql', 'socket.io']) 호출
2. docs/progress.md 출시 전 작업 로드맵 확인
3. deci-duel-app/docs/CODEX_TO_CLAUDE.md 확인 (앱 측 요청 있는지)
4. Phase A 계속: ProfileScreen 승패/승률/연승 통계 제거, AchievementsScreen/HistoryScreen 제거, FriendsScreen 처리

## Decision Log
| 날짜 | 결정 내용 | 이유 |
|------|-----------|------|
| 2026-05-27 | WebSocket JWT는 handleConnection 1회 검증 후 client.data.userId 저장 | 매 이벤트마다 검증은 오버헤드 |
| 2026-05-27 | 인메모리 상태 관리 (GameRoomStore) | 라운드 타이머, 재연결 grace period는 DB에 맞지 않음 |
| 2026-05-27 | 5.5초 서버 하드 타임아웃 + 클라이언트 5초 UI 타이머 | 네트워크 지연 허용(500ms 버퍼) |
| 2026-05-28 | MCP stdio 래퍼 방식 채택 | Claude Code의 HTTP MCP는 JSON-RPC 2.0 필요, 커스텀 REST API와 불일치 |
| 2026-05-28 | TTL 기반 방 정리 (10분) | game_over 후 재대결 대기가 필요해 즉시 cleanupRoom 불가 |
| 2026-05-28 | NO_FORFEIT_STATES 상수로 forfeit 면제 상태 분리 | waiting/ready/game_over/rematch_waiting은 게임 활성 상태가 아님 |
| 2026-05-28 | 리더보드 profileImageUrl 미포함 (초기 결정) | top 50 R2 서명 URL 생성은 비동기 50개 호출 = 성능 병목. 아바타 컬러만으로 UI 충분 |
| 2026-06-01 | 리더보드 profileImageUrl 포함으로 재결정 | `Promise.all` 병렬 호출로 성능 허용 범위 내. 개별 실패는 null 처리. 앱 UI가 프로필 이미지를 요청하는 상황 반영 |
| 2026-06-01 | room:reconnected profileImageUrl 통일 | room:joined/opponent:joined와 동일하게 profileImageUrl(서명 URL)로 내려줌. key 노출 없음 |
| 2026-06-01 | game.gateway.spec.ts 재연결 테스트 payload assert 추가 | roomCode/isHost/myScore/oppScore/roundResults/opponent 전체 검증 |
| 2026-05-28 | 리더보드 top 50 (TOP_N=50) | 초기 단계 충분. 무한스크롤/페이지네이션은 사용자 증가 후 추가 |
| 2026-05-30 | 친구 대결 wins/losses 저장 중단 예정 | 랜덤 매칭 전까지 의미 없는 데이터. 랜덤 매칭 때 GameRecord와 함께 재도입 |
| 2026-05-30 | 배경음악 미포함 결정 | dB 측정 게임 특성상 배경음이 측정값에 영향줌. 효과음/햅틱으로 대체 |
| 2026-05-30 | 온보딩 스와이프 카드 4장 방식 채택 | 인터랙티브 튜토리얼 대비 공수 낮고 앱 진입 빠름 |
| 2026-05-30 | i18n 한국어/영어 2개국어 지원 | 해외 사용자 대응. 서버 메시지는 앱에서 코드 기반 번역 (서버 변경 불필요) |
| 2026-05-30 | HistoryScreen/AchievementsScreen 초기 제거 | GameRecord 없음. 빈 화면은 UX 저하. 랜덤 매칭 때 함께 추가 |
| 2026-05-30 | useMicDb start deps=[] + hasPermissionRef 패턴 | Android 두 번째 게임에서 권한 즉시 granted → start 재생성 → Maximum update depth exceeded. iOS는 미사전 요청으로 해당 없음 |
| 2026-05-30 | rematchMatchedAt 이중 리셋 (round:start + useRef 초기화) | 두 번째 게임 GameResultScreen 마운트 시 stale timestamp로 즉시 navigate 발동 방지 |
| 2026-05-30 | hasNavigatedAway ref 패턴 3개 화면 일괄 적용 (MatchFound/WaitingRoom/GameResult) | Android 백 버튼/iOS 스와이프 백이 leaveRoom() bypass → 서버 playerToRoom 잔존 → 다음 게임 "이미 방에 참여 중" |
| 2026-05-30 | DuelLobby isFocusedRef (useFocusEffect 기반) | navigation.isFocused()가 iOS에서 Modal 열린 상태에 false 반환 → room:joined 후 navigate 미실행 |
| 2026-05-30 | server room:join slotCheckStates에 'ready' 추가 | 리매치 후 ready 상태에서 한 명이 백 버튼으로 나가면 슬롯이 잠겨 새 플레이어 입장 불가 |
| 2026-05-30 | server game:rematch rematchAllowed에 'waiting' 추가 | 상대가 먼저 나가 방이 waiting 된 경우에도 리매치 요청 허용 |
| 2026-05-30 | 방장(isHost) 설계 재정의 필요 (미결) | 현재 두 플레이어 대칭 처리 → 방장 나갈 때 게스트 알림 없음, 혼자 리매치 대기 가능 등 모호성 존재 |
| 2026-05-30 | room:host_transferred 이벤트 도입 + goToWaitingRoom 신호 패턴 | 방장 이탈 시 게스트가 새 방장이 됨. goToWaitingRoom boolean 신호로 어느 화면에서든 WaitingRoom 복귀 통일 처리 |
| 2026-05-30 | tryReconnect: 비활성 상태에서 조용히 제거 | waiting/game_over 상태 방에 재연결 시도 시 "이미 방에 참여 중" 에러 방지. reconnectStates 목록에 없는 상태면 방에서 제거 후 신규 입장 허용 |
| 2026-05-30 | mountedFinalResult useRef 패턴 (MatchFoundScreen) | MatchFoundScreen 마운트 시점 finalResult가 이미 있으면 이전 게임 stale 값 → 즉시 GameResult navigate 방지 |
| 2026-05-30 | room:join slotCheck: room.players.size >= 2 단순화 | isHost 도입으로 플레이어 역할이 명확해지면서 복잡한 slotCheckStates 배열 불필요 |
| 2026-06-07 | 서버사이드 OAuth Authorization Code Flow 엔드포인트 전면 제거 | Codex [14:14] 지시 + 사용자 결정으로 Expo Go 포기, Apple/Google/Kakao 모두 네이티브 SDK(idToken/accessToken) 기준으로 통일. `GET /auth/oauth/{kakao,google}/{init,callback}`, `POST /auth/oauth/exchange`와 관련 헬퍼(`pendingStates`, `pendingAuthCodes`, `createOAuthState`, `consumeOAuthState`, `buildAuthCodeRedirect`, `kakaoInitUrl`, `googleInitUrl`, `ALLOWED_REDIRECT_SCHEMES`)를 `auth.service.ts`/`auth.controller.ts`에서 삭제. `POST /auth/oauth` 단일 엔드포인트로 Apple(`idToken`)/Google(`idToken`)/Kakao(`accessToken`) 공통 처리 |
| 2026-06-07 | OAuth idToken에 audience(aud) 검증 추가 | 기존엔 issuer만 검증해 다른 앱(audience)에서 발급한 idToken도 통과 가능했던 보안 공백. `APPLE_ALLOWED_AUDIENCES`(Bundle Identifier), `GOOGLE_ALLOWED_CLIENT_IDS`(웹/iOS/Android 클라이언트 ID, 콤마 구분)를 콤마 분리 허용 목록으로 env에서 읽어 `aud` claim과 대조. env 미설정 시엔 검증을 스킵(로컬 개발 한정, 운영 배포 전 필수 설정) |
| 2026-06-07 | Kakao accessToken에 앱 ID 검증 추가 | Apple/Google은 idToken `aud`를 검증하지만 Kakao accessToken-only 흐름은 audience claim이 없어 검증 수준이 낮았음. Kakao `/v1/user/access_token_info`를 먼저 호출해 응답 `app_id`를 서버 env `KAKAO_APP_ID`와 비교한 뒤 `/v2/user/me`에서 providerId를 조회하도록 보강. `OAUTH_AUDIENCE_REQUIRED=true` 또는 `NODE_ENV=production`인데 `KAKAO_APP_ID`가 없으면 401로 실패 |
| 2026-06-07 | provider별 필수 토큰 누락을 400으로 명시적 처리 | 기존엔 `idToken!`/`accessToken!` non-null assertion으로 undefined가 그대로 검증 함수에 전달돼 401(`OAUTH_INVALID_TOKEN`)로 뭉뚱그려졌음. `verifyOAuthToken`에서 provider별 필수 토큰 존재를 먼저 검사해 `OAUTH_TOKEN_REQUIRED`(400)로 분리 — 클라이언트가 "잘못된 요청"과 "토큰 검증 실패"를 구분 가능 |
| 2026-06-07 | Kakao REST API 키/시크릿/리다이렉트 URI는 더 이상 서버에 불필요 | 네이티브 SDK가 발급한 accessToken을 Kakao `/v2/user/me`에 Bearer로 그대로 전달해 검증하므로 REST API 키 불필요. `.env.example`에서 `KAKAO_CLIENT_ID/SECRET/REDIRECT_URI`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` 제거하고 `APPLE_ALLOWED_AUDIENCES`/`GOOGLE_ALLOWED_CLIENT_IDS`로 대체 (`.env`는 AGENTS.md 수정 금지 대상이라 사용자가 직접 갱신 필요) |
| 2026-06-07 | **[Codex 지시서] Phase 1 (Observability) + Phase 2 MVP (Admin Auth+API) 구현 완료** | requestId/AsyncLocalStorage, pino 구조화 로깅, OperationalEvent, Admin 모듈 전체. 상세 결정 사항은 아래 항목들 |
| 2026-06-07 | requestId 생성을 미들웨어(`RequestContextMiddleware`)에서 전담 | 인터셉터/가드보다 먼저 실행되어야 모든 하위 레이어(가드, 컨트롤러, 필터, 로거)가 동일 컨텍스트를 공유. 클라이언트 `x-request-id`는 정규식 `/^[a-zA-Z0-9_.-]{1,128}$/`(최대 128자)로 검증 후 신뢰 — 형식 미검증 시 로그 인젝션/헤더 오염 위험. 형식 불일치/누락 시 서버가 `req_<uuid>` 생성 |
| 2026-06-07 | `ApiResponse`에 `requestId`를 4번째 옵셔널 인자 + 자동 채움으로 추가 | 기존 `new ApiResponse(status, message, data)` 호출부 전체를 수정하지 않고도 모든 응답에 requestId가 실리도록 생성자 내부에서 `getRequestId()`로 자동 보강. 컨텍스트 없으면 `undefined`이며 JSON 직렬화 시 생략되어 앱 파서 호환성 깨지지 않음 |
| 2026-06-07 | pino 기반 `AppLogger`로 구조화 로깅 전환 + requestId/userId 자동 포함 | `AsyncLocalStorage` 컨텍스트에서 매 로그 호출마다 requestId/userId를 자동 첨부. 절대 로그에 남기면 안 되는 값(accessToken/refreshToken/idToken/Authorization 원문/password·secret 계열/요청 본문 전체)은 호출부에서부터 필드로 넘기지 않는 것을 원칙으로 하고, 테스트(`app-logger.service.spec.ts`)로 회귀 방지 |
| 2026-06-07 | `OperationalEvent`는 "관리자에게 의미 있는" 이벤트만 선별 저장 (전체 HTTP 로그 미저장) | DB 부하/노이즈 방지. 카테고리: `auth\|admin\|http\|socket\|game\|system\|storage`. socket/game 이벤트 taxonomy 정의: `socket_connect_rejected/connected/disconnected/reconnected`, `room_create_failed/created/join_failed/joined`, `round_mic_error`, `room_host_transferred`, `opponent_left`, `match_prepare_failed`, `game_forfeited`, `game_over`. `opponent:db` 등 고빈도 실시간 스트림/heartbeat성 이벤트는 명시적으로 제외 |
| 2026-06-07 | `OperationalEventService.record()`는 절대 throw하지 않음 (try/catch 내부 흡수) | Codex 제약 "OperationalEvent 저장 실패가 원 요청 실패로 이어지면 안 됨" 준수. DB 저장 실패 시 구조화 로그만 남기고 원 요청은 정상 진행. `sanitizeMetadata()`로 `accessToken/refreshToken/idToken/password/secret` 계열 키를 재귀적으로 `[REDACTED]` 치환 — metadata에도 토큰/시크릿/본문 원문 저장 금지 |
| 2026-06-07 | gateway 핸들러의 OperationalEvent 호출 패턴: sync는 `void record(...)`, async는 `await record(...)` | `record()`가 `Promise<void>`를 반환하고 절대 throw하지 않음이 보장되므로 sync 메서드를 굳이 async로 리팩터링하지 않고 fire-and-forget(`void`)으로 처리. 이미 async인 메서드는 `await`로 순서 보장 |
| 2026-06-07 | Admin 인증을 일반 유저 JWT와 완전히 분리된 별도 시스템으로 설계 | ① 별도 secret(`ADMIN_JWT_SECRET` ≠ `JWT_SECRET`) — 동일하면 일반 유저 토큰 위조로 admin 권한 탈취 가능. ② 별도 payload 형태(`{type:'admin', role:'owner'}` vs `{sub, nickname}`). ③ 별도 strategy/guard(`admin-jwt`/`AdminJwtGuard`)가 `payload.type !== 'admin' \|\| payload.role !== 'owner'`를 엄격히 검사해 일반 유저 토큰의 admin API 접근을 원천 차단. 토큰 타입 혼동에 의한 권한 상승을 구조적으로 방지 |
| 2026-06-07 | Admin 로그인은 "접속 코드 단일 인증" (계정/비밀번호 시스템 도입하지 않음) | MVP 범위에서 별도 admin 계정 테이블/가입 플로우는 과한 설계. `ADMIN_ACCESS_CODE` 단일 공유 코드를 `timingSafeEqual` 기반 상수 시간 비교로 검증해 타이밍 사이드채널 방지. 코드 원문은 어떤 경로로도(로그/이벤트 metadata) 저장하지 않음 — 검증 결과(성공/실패/rate-limit)만 기록 |
| 2026-06-07 | Admin 로그인 rate limit은 메모리 기반 (IP당 5분 5회) | MVP 단계에서 Redis 등 외부 저장소 도입은 과함. 서버 재시작 시 초기화되는 것을 허용 (단일 인스턴스 가정). 5회 실패 시 429 + `admin_login_rate_limited` 이벤트 기록, 로그인 성공 시 해당 IP 카운터 리셋 |
| 2026-06-07 | `AdminModule`에서 `JwtModule.register({})` (빈 옵션) 사용 | 일반 유저 `JwtModule`(전역 `JWT_SECRET`, 7d 만료 기본값)과 설정을 공유하면 admin 토큰에도 동일 secret/만료가 적용되는 사고 위험. `AdminAuthService`/`AdminJwtStrategy`에서 매 호출마다 `ADMIN_JWT_SECRET`/`ADMIN_TOKEN_EXPIRES_IN`을 명시적으로 주입해 완전히 독립된 설정 유지 |
| 2026-06-07 | `GET /admin/events`는 커서(cursor) 기반 페이지네이션 (offset 아님) | 운영 이벤트는 지속적으로 INSERT되는 append-only 데이터라 offset 페이지네이션은 페이지 이동 중 결과 밀림(드리프트) 발생. `id` 기준 cursor + `take: limit+1`로 `hasMore`/`nextCursor` 판별. `limit`은 기본 50, 최대 200으로 clamp (대량 조회로 인한 DB 부하 방지) |
| 2026-06-07 | 마이그레이션 `20260607104635_add_operational_events` — 인덱스 설계: `(level, created_at)`, `(category, event, created_at)`, `(request_id)`, `(userId, created_at)` | Admin 대시보드의 주요 조회 패턴(레벨/카테고리+이벤트/특정 요청 추적/특정 유저 이력, 모두 최신순)을 커버하는 복합 인덱스 선정 |
| 2026-06-08 | **[Codex 리뷰 점검 6건]** request context actor 반영 / admin secret fail-closed / .env.example 정리 / check_db.ts 삭제 / pino-http 제거 — 5건 완전 해결. Jest open-handle 경고는 root cause 2건 수정했으나 경고 자체는 환경적 요인으로 잔존(Codex `[2026-06-08 09:00]` 보류 결정과 일치) | `CODEX_TO_CLAUDE.md` [2026-06-07 21:20] 리뷰 6항목에 대한 후속 조치. 상세는 아래 항목들 + `CLAUDE_TO_CODEX.md` 완료 보고서 참고 |
| 2026-06-08 | `JwtAuthGuard`/`AdminJwtGuard`가 `handleRequest()`를 override해 인증 성공 시점에 `setContextUserId()`/`setContextAdmin(role)` 호출 | 기존엔 `setContextUserId()` 헬퍼만 정의돼 있고 실제 가드에서 호출되지 않아 인증된 요청의 로그/OperationalEvent에 userId가 전혀 찍히지 않는 결함이 있었음(Codex 리뷰 #1). 가드의 `handleRequest`는 Passport 인증 성공/실패를 가로채는 표준 확장 지점이라 컨트롤러 진입 전, 인터셉터/로거보다 먼저 컨텍스트를 채울 수 있음. `RequestContextStore`에 `actorType?: 'user'\|'admin'`/`adminRole?: string` 필드 추가, `setContextUserId`는 `actorType: 'user'`도 함께 설정 |
| 2026-06-08 | `resolveAdminJwtSecret()` 헬퍼로 `ADMIN_JWT_SECRET` fail-closed 검증을 일원화, `AdminJwtStrategy` 생성자(=모듈 초기화 시점)에서 호출해 실패 시 서버 기동 자체를 막음 | 기존 `config.get('ADMIN_JWT_SECRET') ?? 'change-me-admin-secret'` 형태의 fallback은, 운영자가 환경변수 설정을 빠뜨려도 서버가 "조용히" 안전하지 않은 기본값으로 기동돼버리는 fail-open 패턴이었음(Codex 리뷰 #2 — 보안 위험). 검증 조건 3가지: ① 미설정/빈 값 ② 플레이스홀더 값(`change-me-admin-secret`) ③ `JWT_SECRET`과 동일 — 이 중 하나라도 해당하면 즉시 throw해 fail-fast(서버 부팅 크래시)로 전환. `AdminAuthService.login()`의 토큰 서명 시점에서도 동일 헬퍼로 이중 검증(defense in depth) |
| 2026-06-08 | pino-pretty를 테스트 환경(`NODE_ENV=test` \|\| `JEST_WORKER_ID` 존재)에서 강제로 끔 (`isTest` 플래그) | **Gotcha**: `pino({ transport: { target: 'pino-pretty' } })`는 내부적으로 별도 worker thread를 생성하는데, `rootLogger`는 `AppLogger` → `HttpExceptionFilter`/`OperationalEventService`를 거쳐 거의 모든 컨트롤러 통합 spec 파일에서 import됨. Jest는 spec 파일마다 격리된 모듈 레지스트리를 쓰므로 spec 파일 수만큼(약 15개) pino-pretty worker thread가 생성되고 한 번도 종료되지 않아 "Jest did not exit / worker process force exited" 경고의 1차 원인이었음(Codex 리뷰 #5). `LOG_PRETTY` 명시적 override는 테스트에서도 유지(디버깅용) |
| 2026-06-08 | `GameRoom`에 `countdownTimer`/`postRoundTimer` 필드를 추가해 기존에 추적되지 않던 `setTimeout` 체인을 모두 추적·정리 | **Gotcha**: pino-pretty 수정만으로는 open-handle 경고가 사라지지 않았음. 원인은 `game.gateway.ts`의 `startCountdown()` 재귀 tick 체인(`setTimeout(tick, 1000)` ×3 + `prepareRound` 진입용 500ms)과 `resolveRound()`의 라운드 종료 후 지연 콜백(`finishGame` 1.5초 / `startCountdown` 2초)이 `room` 객체에 저장되지 않아 `cleanupRoom()`/`resetGameData()`/`handleForfeit()` 등 어떤 정리 경로에서도 `clearTimeout`되지 못했던 것 — `roundTimer`/`prepareTimer`/`ttlTimer`/`disconnectTimer`는 정상적으로 추적·정리되고 있었으나 이 두 체인만 누락. 방이 강제 종료(forfeit/disconnect/technical-abort)된 뒤에도 고아 타이머가 살아남아 죽은 방을 향해 emit을 시도하거나 (테스트 환경에서) 이벤트 루프를 계속 점유 → "worker process failed to exit gracefully" 경고의 실질 원인. 두 필드를 추가해 매 tick/지연마다 최신 handle로 갱신하고, `cleanupRoom`/`resetGameData`/`handleForfeit`/disconnect 시 room reset 경로 전부에서 `clearTimeout` 추가 |
| 2026-06-08 | Jest open-handle 경고 — 두 root cause 수정 후에도 잔존, 추가 조사 후 "환경 특성"으로 결론·보류 | **Decision**: pino-pretty + countdownTimer/postRoundTimer 두 fix를 모두 적용한 뒤 전체 스위트(`219/219` 통과)와 `game.gateway.spec.ts` 단독 실행(`37/37` 통과) 양쪽에서 경고가 계속 나타남을 확인. `httpServer.closeAllConnections()`(Node 18.2+)를 spec `afterAll`에 추가해 socket.io/engine.io keep-alive 소켓을 강제 종료하는 추가 시도도 효과 없어 되돌림. `src` 전체에 setInterval/setTimeout 사용처를 모두 grep해 다른 leak 가능성도 배제. 결론: 남은 경고는 실제 NestJS 앱+socket.io 서버를 random port에 띄우는 통합 테스트(`game.gateway.spec.ts`) 특유의 하네스 teardown 타이밍 문제(engine.io 내부 핸들이 Jest의 1초 grace window를 초과 — socket.io+Jest 조합에서 흔한 유형의 이슈)로 판단, 애플리케이션 결함이 아님. Codex가 `[2026-06-08 09:00]`에 이미 동일 결론으로 "보류" 결정을 내렸으므로 더 이상 조사하지 않고 완료 보고에 진단 결과를 남기는 것으로 마무리 |
| 2026-06-08 | `main.ts`에 `app.enableCors()` 추가 — 허용 오리진을 `CORS_ALLOWED_ORIGINS` 환경변수(콤마 구분, 미설정 시 `http://localhost:5173` 기본값)로 관리, `credentials: true` | Admin SPA(`deci-duel-web`)가 브라우저에서 직접 fetch로 REST API를 호출하는 첫 cross-origin 클라이언트가 됨. 기존 React Native 앱은 브라우저가 아니라 CORS 영향을 받지 않아 서버에 CORS 설정 자체가 없었음. 화이트리스트를 코드에 하드코딩하지 않고 환경변수로 분리해, 운영 배포 시(Cloudflare Pages 도메인 등) `.env`만 바꾸면 되도록 함 — 코드 변경/재배포 없이 오리진 추가/교체 가능. `.env.example`에 `CORS_ALLOWED_ORIGINS="http://localhost:5173"` 추가 |
| 2026-06-08 | **Admin SPA 구현 범위 1차 확정**: ① 로그인(접속코드→JWT, **sessionStorage** 저장) ② Dashboard/Health(`GET /admin/health` 카드뷰 + 폴링) ③ Events 뷰어(필터+커서 페이지네이션+metadata JSON pretty-print) ④ 정적 공개 페이지(약관/개인정보/AdMob 자리, 인증과 무관한 라우트로 분리) — Codex `[2026-06-08 09:00]` 지시서의 4단계 순서 그대로 1차에 모두 포함. 별도 레포 `deci-duel-web`(`https://github.com/Llimy1/deci-duel-web.git`, 로컬 `/Users/iminhyeog/dev/deci-duel-web`)으로 신규 구축, Vite + React + TS + Cloudflare Pages | 사용자와 논의 후 확정. **토큰 저장 — sessionStorage 선택**: Admin JWT 만료가 1시간 내외로 짧고, 메모리만 쓰면 새로고침마다 재로그인해야 해 불편함이 큼. localStorage는 영속성이 과하고 XSS 탈취 시 피해 기간이 김. sessionStorage는 탭 닫으면 사라지면서도 새로고침엔 살아남는 절충점. **차트/실시간소켓/유저관리는 1차 제외**: 현재 서버 Admin API가 조회 전용 3종(`/admin/auth/login`, `/admin/health`, `/admin/events`)뿐이고 데이터 양·운영 단계상 테이블/카드+폴링이면 충분, 차트 라이브러리·admin 전용 소켓 채널·유저 CUD는 과한 투자이자 "서버 API 계약 변경 금지" 제약과도 충돌. 정적 공개 페이지는 인증 플로우와 무관한 단순 정적 라우트라 공수가 크지 않아 1차에 함께 포함하는 게 효율적이라고 판단 |

## 블로커
- (없음)
