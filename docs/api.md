# DeciDuel API 컨트랙트

> **단일 진실의 원천 (Single Source of Truth).**
> Claude가 백엔드 구현과 함께 이 문서를 갱신한다. Codex는 앱에서 호출하기 전에 항상 이 문서를 먼저 확인한다.
> 문서와 실제 서버 동작이 다르면 `CODEX_TO_CLAUDE.md`에 question으로 남길 것.

- Base URL: `process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000'`
- 글로벌 prefix 없음. 경로는 모두 절대 경로(`/auth/...`).
- CORS: 현재 NestFactory 기본값. (운영 배포 시 도메인 화이트리스트 추가 예정 — Claude TODO)

---

## 공통 응답 포맷

모든 응답은 `ApiResponse<T>` 래핑이다.

### 성공
```jsonc
{
  "statusCode": 200,         // 또는 201 (생성)
  "message": "...",          // 사람이 읽는 메시지(한국어, enum 기반)
  "data": { /* T */ }
}
```

### 실패
`HttpExceptionFilter`가 모든 `HttpException`을 동일 포맷으로 변환한다.

```jsonc
{
  "statusCode": 401,         // 4xx/5xx
  "message": "유효하지 않은 토큰입니다",
  "data": null               // 항상 null
}
```

### 공통 에러 코드

| status | 의미 | 발생 케이스 |
|---|---|---|
| 400 | Bad Request | 잘못된 요청 형식, 잘못된 파라미터 |
| 401 | Unauthorized | 토큰 부재/만료/위조/재사용 |
| 404 | Not Found | 자원 없음 (계정/다이어리/기록) |
| 409 | Conflict | 닉네임/아이디 중복 |
| 500 | Internal | 서버 내부 오류 |

> **현재 401은 만료/위조/재사용을 message로 구분하지 않는다.** 모두 `'유효하지 않은 토큰입니다'`. (개선 시 별도 코드 도입 검토)

---

## 인증 (Auth)

### POST `/auth/dev/signup`

개발용 회원가입. (소셜 OAuth는 추후)

**Request body**
```ts
{ id: string; password: string; nickname: string }
```

**Response 201**
```ts
{
  statusCode: 201,
  message: "회원가입에 성공했습니다.",
  data: { accessToken: string; refreshToken: string; user: { id: number; nickname: string } }
}
```

**Errors**
- 409 `이미 사용 중인 아이디입니다.`

---

### POST `/auth/dev/login`

**Request body**
```ts
{ id: string; password: string }
```

**Response 200**
```ts
{ statusCode: 200, message: "로그인에 성공했습니다.",
  data: { accessToken, refreshToken, user: { id, nickname } } }
```

**Errors**
- 404 `존재하지 않는 계정입니다`
- 401 `비밀번호가 틀렸습니다`

---

### POST `/auth/refresh`

**Request body**
```ts
{ refreshToken: string }
```

**Response 200**
```ts
{ statusCode: 200, message: "토큰 재발급에 성공했습니다.",
  data: { accessToken, refreshToken, user: { id, nickname } } }
```

**Errors**
- 401 `유효하지 않은 토큰입니다` — 만료/위조/DB의 refreshToken 불일치 모두 동일 메시지

**Token policy (현재값)**
- `accessToken` TTL: **15m**
- `refreshToken` TTL: **30d**
- **Refresh rotation: ON** — 매 `/auth/refresh` 호출 시 새 accessToken + 새 refreshToken을 발급하고, DB의 `user.refresh_token` 컬럼을 새 값으로 덮어씀.
- 그래서 클라이언트는 매 refresh 응답의 새 refreshToken을 즉시 SecureStore에 저장해야 한다.
- **동시 호출 주의**: 같은 refreshToken으로 두 요청이 거의 동시에 도착하면, 첫 번째가 성공하는 순간 DB 컬럼이 갱신되어 두 번째는 401이 된다. 클라이언트는 **single-flight** 패턴으로 refresh 호출을 직렬화해야 함.

---

## 보호된 라우트 공통

- 헤더: `Authorization: Bearer <accessToken>` (passport-jwt, `fromAuthHeaderAsBearerToken`)
- 만료/위조 시: 401 `유효하지 않은 토큰입니다` *(또는 passport 기본 401 — 메시지가 다를 수 있음. 확인 후 갱신 예정)*
- 클라이언트 401 처리는 **앱 쪽 single-flight refresh wrapper**가 책임진다.

---

## 사용자 (User)

### GET `/user/nickname/check?nickname=<string>`

**인증**: 불필요 (회원가입 흐름에서 사용)

**Response 200**
```ts
{ statusCode: 200, message: "사용가능한 닉네임입니다." | "이미 사용 중인 닉네임입니다.",
  data: { available: boolean } }
```

---

### GET `/user/me`

**인증**: Bearer 필요

**Response 200**
```ts
{
  statusCode: 200,
  message: "내 프로필 조회에 성공했습니다.",
  data: {
    id: number,
    nickname: string,
    avatarColor: string,        // "#RRGGBB", 기본값 "#ff2d87"
    profileImageUrl: string | null,  // Cloudflare R2 서명 URL (1시간 유효). 없으면 null → 앱에서 아바타 이니셜 표시
    streak: number,             // 연승 수 (현재는 항상 0 — 매치 시스템 구현 시 채워짐)
    wins: number,               // 승 (현재 0 — 매치 시스템 미구현)
    losses: number,             // 패 (현재 0 — 매치 시스템 미구현)
    bestDb: number,             // SoloRecord.bestDb. 솔로 기록 없으면 0
    createdAt: string           // ISO 8601
  }
}
```

**Errors**
- 401 — 토큰 부재/만료/위조
- 404 `존재하지 않는 계정입니다`

> **레벨/XP 컨셉 없음.** 등급 시스템이 아니라서 의도적으로 제외.

---

### POST `/user/me/profile-image`

**인증**: Bearer 필요

**Request**: `multipart/form-data`, 필드명 `image`
- 허용 타입: `image/jpeg`, `image/png`, `image/webp`
- 최대 크기: **5MB**

**Response 200**
```ts
{ statusCode: 200, message: "프로필 이미지가 변경되었습니다.",
  data: { profileImageUrl: string } }
```

**Errors**
- 400 `이미지 파일만 업로드 가능합니다. (jpeg, png, webp)`
- 400 `이미지 파일 크기는 5MB 이하여야 합니다.`

> **저장 방식**: 이미지 키(`profiles/{userId}/{uuid}.{ext}`)를 DB에 저장. URL은 저장하지 않음.
> 응답의 `profileImageUrl`은 **Cloudflare R2 서명 URL (유효기간 1시간)**. 퍼블릭 버킷 불필요.
> 앱은 `GET /user/me` 재호출 시 새 서명 URL을 받으므로, 약 50분 주기로 `/user/me`를 다시 호출하거나 화면 진입 시마다 호출하면 됨.

---

### POST `/auth/logout`

**인증**: Bearer 필요

**Response 200**
```ts
{ statusCode: 200, message: "로그아웃에 성공했습니다.", data: null }
```

> DB의 `user.refresh_token`을 null로 처리. 이후 해당 refreshToken으로 `/auth/refresh` 시도 시 401.
> 클라이언트는 호출 후 SecureStore 토큰 삭제 + store logout 액션 실행.

---

### PATCH `/user/me/nickname`

**인증**: Bearer 필요

**Request body**
```ts
{ nickname: string }
```

**Response 200**
```ts
{ statusCode: 200, message: "닉네임이 변경되었습니다.", data: { nickname: string } }
```

**Errors**
- 400 `닉네임은 2자 이상이어야 합니다.`
- 400 `닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.`
- 409 `이미 사용 중인 닉네임입니다.`

---

### PATCH `/user/me/avatar-color`

**인증**: Bearer 필요

**Request body**
```ts
{ avatarColor: string }  // "#RRGGBB" 형식만 허용
```

**Response 200**
```ts
{ statusCode: 200, message: "아바타 색상이 변경되었습니다.", data: { avatarColor: string } }
```

**Errors**
- 400 `올바른 색상 코드를 입력해주세요. (#RRGGBB)`

---

### DELETE `/user/me`

**인증**: Bearer 필요

**Response 200**
```ts
{ statusCode: 200, message: "회원 탈퇴가 완료되었습니다.", data: null }
```

> 하드 삭제. 연관 SoloRecord, DiaryRecord도 DB cascade로 함께 삭제됨.
> 클라이언트는 호출 후 SecureStore 토큰 삭제 + store logout + 온보딩 첫 화면 이동.

---

## 솔로 기록 (Solo Record)

### POST `/solo/record`

**인증**: Bearer 필요

**Request body**
```ts
{ peakDb: number }
```

**Response 201**
```ts
{ statusCode: 201, message: "솔로 기록 저장에 성공했습니다.",
  data: { success: boolean } }
```

> **현재 동작**: 유저당 SoloRecord는 1개(`@unique userId`). 새 기록이 오면 기존 row를 갱신한다. `bestDb`는 최댓값 누적.

---

### GET `/solo/record`

**인증**: Bearer 필요

**Response 200**
```ts
{ statusCode: 200, message: "솔로 기록 조회에 성공했습니다.",
  data: { peakDb: number, bestDb: number } }
```

> **단일 row만 반환.** 히스토리/시계열이 필요한 화면(`HistoryScreen`)에서는 부족함. **Phase B에서 `GET /me/solo-records` (pagination) 추가 예정.**

---

## 다이어리 (Diary)

모든 엔드포인트 Bearer 필요.

### POST `/diary`

**Request body**
```ts
{ peakDb: number, emoji: string, comment?: string, date: string /* "YYYY-MM-DD" */ }
```

**Response 201**: `{ success: true }`

**Errors**: 409 (같은 날짜 중복) — `@@unique([userId, date])`

---

### GET `/diary?year=YYYY&month=MM`

**Response 200**: `{ entries: [{ date, peakDb, emoji, comment }] }`

---

### GET `/diary/:date` *(date = "YYYY-MM-DD")*

**Response 200**: `{ date, peakDb, emoji, comment }`
**Errors**: 404 `해당 날짜의 다이어리 기록이 없습니다.`

---

### PATCH `/diary/:date`

**Request body**: `{ peakDb?, emoji?, comment? }` (부분 업데이트)
**Response 200**: `{ success: true }`

---

### DELETE `/diary/:date`

**Response 200**: `{ success: true }`

---

## WebSocket — 대결 게임 (Game)

### 연결

```
namespace : /game
transport : websocket
auth      : { token: "<accessToken>" }   // JWT — 핸드셰이크 시 검증
```

연결 시 JWT 검증 실패(만료·위조·토큰 없음)는 즉시 `disconnect`.

---

### 상태 머신

```
waiting → ready → countdown → playing → round_end ┐
                                    ↑              │ 마지막 라운드
                                    └──────────────┘
                                               ↓
                                          game_over ←→ rematch_waiting
```

---

### Client → Server

| 이벤트 | payload | 설명 |
|--------|---------|------|
| `room:create` | _(없음)_ | 새 방 생성. 방 코드 발급. |
| `room:join` | `{ roomCode: string }` | 방 입장. `waiting` 상태만 허용 (대소문자 무관). `game_over`/`rematch_waiting`에서도 disconnected 슬롯이 있으면 3자 입장 가능. |
| `game:ready` | _(없음)_ | 준비 완료 선언. 양쪽 모두 ready이면 카운트다운 시작. |
| `round:submit` | `{ round: number; peakDb: number }` | 라운드 피크 dB 제출. 범위 clamp: 0–200. |
| `round:db` | `{ round: number; db: number }` | 측정 중 실시간 dB 스트림. 상대에게 `opponent:db` 전달. `playing` 상태만 처리. |
| `round:mic-ready` | `{ round: number }` | 마이크 준비 완료 선언. `preparing` 상태에서만 유효. |
| `round:mic-error` | `{ round: number, reason?: string }` | 마이크 준비 실패 선언. `preparing` 상태에서만 유효. 공식 라운드 시작 전이면 `match:prepare-failed`로 처리, 이후면 forfeit. |
| `game:rematch` | _(없음)_ | 재대결 요청. `game_over` 또는 `rematch_waiting` 상태에서만 가능. |
| `room:leave` | _(없음)_ | 명시적 방 나가기. 활성 게임 중 + 공식 라운드 시작 전이면 setup cancel (forfeit 없음). 공식 라운드 시작 후면 즉시 forfeit. |

---

### Server → Client

#### 방 관리

| 이벤트 | payload | 시점 |
|--------|---------|------|
| `room:created` | `{ roomCode: string }` | `room:create` 성공 |
| `room:joined` | `{ roomCode: string; isHost: boolean; opponent: { userId, nickname, avatarColor, bestDb, profileImageUrl: string\|null } }` | `room:join` 성공 |
| `opponent:joined` | `{ userId, nickname, avatarColor, bestDb, profileImageUrl: string\|null, isHost: boolean }` | 상대방이 방에 입장 |
| `room:reconnected` | `{ roomCode, isHost, myScore, oppScore, roundResults: [{round, myDb, oppDb}], opponent: { userId, nickname, avatarColor, profileImageUrl: string\|null, bestDb } \| null }` | 재연결 시 내 소켓에게 |

#### 준비

| 이벤트 | payload | 시점 |
|--------|---------|------|
| `opponent:ready` | `{}` | 상대방이 `game:ready` 전송 시 |

#### 게임 진행

| 이벤트 | payload | 시점 |
|--------|---------|------|
| `round:countdown` | `{ count: number }` | 3→2→1→0, 1초 간격 |
| `round:prepare` | `{ round: number, prepareTimeoutMs: number, remainingPrepareTimeoutMs?: number }` | 라운드 시작 전 마이크 준비 요청. 현재 prepare window: 8000ms |
| `opponent:mic-ready` | `{}` | 상대방 마이크 준비 완료 |
| `opponent:mic-error` | `{}` | 상대방 마이크 준비 실패 |
| `round:start` | `{ round: number, durationMs: number }` | 라운드 시작 (측정 시작). durationMs: 클라이언트 측정 시간 (5000ms) |
| `opponent:db` | `{ round: number; db: number }` | 상대방의 실시간 dB (0–200) |
| `round:result` | `{ round, myDb, oppDb, roundResult: 'win'|'lose'|'draw', myScore, oppScore }` | 라운드 종료 |
| `game:over` | `{ result: 'win'|'lose'|'draw', myScore, oppScore, rounds: [{round, myDb, oppDb}], forfeit?: true }` | 게임 종료 |
| `match:prepare-failed` | `{ reason: 'mic_prepare_failed', failedUserIds: number[], round: number, retryable: true, resetTo: 'match_ready', message: string }` | 공식 라운드 시작 전 mic 준비 실패. `game:over`와 다르며 전적/점수에 반영되지 않음. 양쪽 client가 MatchFound 화면으로 복귀해야 함. |

#### 재대결

| 이벤트 | payload | 시점 |
|--------|---------|------|
| `rematch:waiting` | `{ roomCode: string }` | 내가 `game:rematch` 전송 후 상대 대기 중 (상대는 별도 알림 없음) |
| `rematch:matched` | `{ roomCode: string }` | 양쪽 모두 재대결 수락 → 방 전체 broadcast, 게임 리셋 후 `ready` 상태로 |

#### 연결 상태

| 이벤트 | payload | 시점 |
|--------|---------|------|
| `opponent:disconnected` | `{ waitSecs: number }` | 상대 연결 끊김. 활성 게임 중(`countdown`/`playing`/`round_end`)이면 `waitSecs: 10` (forfeit 대기). 그 외 상태는 `waitSecs: 0`. |
| `opponent:reconnected` | _(payload 없음)_ | 상대방이 10초 내 재연결 |
| `opponent:left` | `{}` | 상대방이 `room:leave`로 명시적으로 나감. 방은 `waiting` 상태로 전환됨. |
| `room:host_transferred` | `{ roomCode: string }` | 방장이 이탈하여 내가 새 방장으로 승격됨 |

> **마이크 권한 vs 런타임 준비 실패:**
> - 권한 없음: app-only gate (DuelLobby/SoloMeasure 진입 전 차단). 서버는 권한 상태를 알지 못함.
> - 런타임 mic prepare 실패: `round:prepare` 이후 `round:mic-ready`가 prepare window 안에 도착하지 않으면 서버 timeout 정책 적용.
> - `all_mic_not_ready`/`mic_prepare_failed`는 permission failure가 아니라 runtime prepare failure.

#### 에러

| 이벤트 | payload |
|--------|---------|
| `error` | `{ message: string }` |

---

### 타이머 / 정책

| 항목 | 값 |
|------|----|
| 라운드 서버 하드 타임아웃 | 5.5초 |
| Mic prepare window | **8초** |
| Forfeit grace period (활성 게임 중 disconnect) | **10초** |
| 방 TTL (game_over / rematch_waiting 후 자동 정리) | **10분** |
| waiting 상태 단독 disconnect | 즉시 방 삭제 |

---

## 리더보드 (Leaderboard)

### GET `/leaderboard/global`

**인증**: Bearer 필요

**Response 200**
```ts
{
  statusCode: 200,
  message: "글로벌 리더보드 조회에 성공했습니다.",
  data: {
    entries: Array<{
      rank: number;                  // 1부터 시작
      userId: number;
      nickname: string;
      avatarColor: string;           // "#RRGGBB"
      bestDb: number;                // float64 전체 정밀도
      profileImageUrl: string | null; // R2 서명 URL (1시간 유효). 이미지 없으면 null
    }>;                              // 최대 50개, bestDb DESC 정렬 (기록 있는 유저 먼저, 이후 기록 없는 유저 id ASC)
    myEntry: {
      rank: number;
      userId: number;
      nickname: string;
      avatarColor: string;
      bestDb: number;                // 기록 없으면 0
      profileImageUrl: string | null;
    };                               // 항상 반환 (기록 없어도 null 아님. bestDb: 0으로 순위 포함)
  }
}
```

> **정렬 기준**: 기록 있는 유저 `SoloRecord.bestDb DESC` → 기록 없는 유저 `User.id ASC` 순으로 이어붙임 (full float64 정밀도)
> **순위 계산**: ROW_NUMBER (dense_rank 아님). 동점 처리 없음 — 동일 bestDb라도 순위 다름.
> **myEntry**: 항상 반환. 기록 없는 유저는 `bestDb: 0`, 순위는 `기록보유 유저 수 + id 기준 앞선 무기록 유저 수 + 1`.
> **페이지네이션**: 없음. TOP_N=50 고정 반환. 추후 무한스크롤 추가 시 limit/offset 파라미터로 확장 예정.
> **profileImageUrl**: `R2StorageService.getSignedDownloadUrl(key)` 를 병렬 호출해 생성. 개별 URL 실패 시 해당 항목만 null 처리 (전체 응답 실패로 이어지지 않음). 서명 URL 유효기간 1시간.

---

## 변경 이력

| 날짜 | 변경 | 작성자 |
|---|---|---|
| 2026-05-21 | 초안 작성 (기존 구현 + 예정 사항 정리) | Claude |
| 2026-05-21 | access TTL 7d → 15m. User에 avatarColor/streak/wins/losses 추가. `GET /user/me` 구현. (level/xp는 제외) | Claude |
| 2026-05-21 | `POST /auth/logout`, `PATCH /user/me/nickname`, `PATCH /user/me/avatar-color`, `DELETE /user/me` 구현 완료 | Claude |
| 2026-05-21 | `POST /user/me/profile-image` (R2 업로드), `GET /user/me`에 `profileImageUrl` 추가. User 스키마 마이그레이션 | Claude |
| 2026-05-21 | 프로필 이미지 저장 방식 변경: 공개 URL → 키 저장 + 서명 URL (1시간 유효). 퍼블릭 버킷 불필요. | Claude |
| 2026-05-28 | WebSocket `/game` 섹션 추가. 신규: `round:db`/`opponent:db`, `game:rematch`/`rematch:*`. `bestDb` 추가됨 (`room:joined`, `opponent:joined`). forfeit 대기 10초로 연장. 방 TTL 10분. | Claude |
| 2026-05-28 | `room:leave` 추가 (명시적 이탈). `opponent:left` 추가. `opponent:rematch-requested` 제거. | Claude |
| 2026-05-28 | `GET /leaderboard/global` 추가. LeaderboardModule 신규 생성. top 50 + myEntry 반환. | Claude |
| 2026-05-30 | 리더보드 스펙 정정: top 100 → 50, myEntry null → 항상 반환 (기록 없으면 bestDb:0), 순위 계산 방식 명시. | Claude |
| 2026-06-01 | `room:joined`/`opponent:joined`에 `isHost`, `profileImageUrl` 추가. `room:reconnected` payload 전체 확장 (`isHost`, `myScore`, `oppScore`, `roundResults`, `opponent{profileImageUrl}`). 리더보드 entries/myEntry에 `profileImageUrl` 추가. | Claude |
| 2026-06-03 | `officialRoundStarted` 플래그 도입. 공식 라운드 시작 전 mic 준비 실패 → `match:prepare-failed` (forfeit 없음, 방 유지). 이후 실패는 기존 forfeit 유지. `round:prepare`에 `remainingPrepareTimeoutMs` 추가. `round:mic-ready`, `round:mic-error` 이벤트 문서화. `match:prepare-failed` 이벤트 추가. `room:host_transferred` 이벤트 추가. 날짜 검증 강화 (월/일 범위 guard). | Claude |
