# 진행 상황

## 마지막 업데이트
2026-05-30 (방장 설계 + 구현 세션)

## 현재 상태
Phase 2 완료 + WebSocket 이벤트 확장 완료 + 리더보드(Phase 3 일부) 완료.
방장(isHost) 설계 재정의 + 구현 완료. Phase A(정리/제거) 진행 중.

## 완료된 작업
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

## 블로커
- (없음)
