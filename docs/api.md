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
  "data": { /* T */ },
  "requestId": "req_<uuid>"  // (2026-06-07 추가) 아래 "요청 추적 (requestId)" 참고. 컨텍스트가 없으면 직렬화 시 생략됨
}
```

### 실패
`HttpExceptionFilter`/`AllExceptionsFilter`가 모든 예외를 동일 포맷으로 변환한다.

```jsonc
{
  "statusCode": 401,         // 4xx/5xx
  "message": "유효하지 않은 토큰입니다",
  "data": null,              // 항상 null
  "requestId": "req_<uuid>"  // (2026-06-07 추가) 컨텍스트가 없으면 생략됨
}
```

### 요청 추적 (requestId) — (2026-06-07 추가)

모든 HTTP 요청은 `RequestContextMiddleware`에서 requestId를 부여받고, `AsyncLocalStorage`로 요청 전체에 전파된다.

- 클라이언트가 `x-request-id` 헤더로 유효한 값(정규식 `/^[a-zA-Z0-9_.-]{1,128}$/`, 최대 128자)을 보내면 그대로 사용
- 없거나 형식이 올바르지 않으면 서버가 생성: `req_<uuid>`
- 응답 헤더 `x-request-id`에 동일 값이 항상 포함됨 (앱-서버 간 이슈 추적 시 이 값으로 서버 로그 검색 가능)
- 모든 성공/실패 응답 본문에 `requestId` 필드가 포함됨 (값이 없을 이론적 경우에만 직렬화 시 생략 — 실제로는 미들웨어가 항상 부여하므로 거의 발생하지 않음)
- **앱 변경 불필요**: 기존 `ApiResponse` 파서는 옵셔널 필드를 무시하므로 호환성 깨짐 없음. 단, 향후 에러 리포팅/문의 응대 시 `requestId`를 함께 받으면 서버 로그 추적이 쉬워짐 (선택적으로 활용 권장)

### 공통 에러 코드

| status | 의미 | 발생 케이스 |
|---|---|---|
| 400 | Bad Request | 잘못된 요청 형식, 잘못된 파라미터 |
| 401 | Unauthorized | 토큰 부재/만료/위조/재사용 |
| 404 | Not Found | 자원 없음 (계정/다이어리/기록) |
| 409 | Conflict | 닉네임/아이디 중복 |
| 429 | Too Many Requests | (2026-06-07 추가) Admin 로그인 시도 횟수 초과 (rate limit) |
| 500 | Internal | 서버 내부 오류 |

> **현재 401은 만료/위조/재사용을 message로 구분하지 않는다.** 모두 `'유효하지 않은 토큰입니다'`. (개선 시 별도 코드 도입 검토)

---

## 인증 (Auth)

> **OAuth 네이티브 SDK 전환 완료 (2026-06-07)**
> `dev/signup` / `dev/login` 제거됨. Apple/Google/Kakao 모두 **네이티브 SDK 기반 로그인**으로 통일.
> DB: `auth_provider`, `provider_id` 컬럼. `dev_id`, `dev_password` 삭제.
>
> ⚠️ **DEPRECATED & REMOVED (2026-06-07)** — 아래 서버사이드 Authorization Code Flow 엔드포인트는 제거되었습니다. 앱은 더 이상 호출하지 않습니다 (Expo Go 호환을 위한 임시 방식이었음):
> - `GET /auth/oauth/kakao/init`, `GET /auth/oauth/kakao/callback`
> - `GET /auth/oauth/google/init`, `GET /auth/oauth/google/callback`
> - `POST /auth/oauth/exchange`
>
> 대신 앱이 Apple/Google/Kakao **네이티브 SDK**로 직접 `idToken`(Apple/Google) 또는 `accessToken`(Kakao)을 발급받아 아래 통합 엔드포인트 `POST /auth/oauth`로 전달합니다.

---

### POST `/auth/oauth` (Apple/Google/Kakao 공통 진입점)

네이티브 SDK가 발급한 토큰을 서버에서 검증 후 로그인 처리.

- Apple: `expo-apple-authentication`의 `identityToken` → JWKS(`appleid.apple.com`) 검증 (issuer + audience)
- Google: `@react-native-google-signin/google-signin`의 `idToken` → JWKS(`googleapis.com`) 검증 (issuer + audience)
- Kakao: `@react-native-kakao/user`의 `accessToken` → Kakao `/v1/user/access_token_info`로 토큰 발급 앱(`app_id`) 검증 후 `/v2/user/me` REST API로 providerId(`id`) 확인

**Request body**
```ts
{ provider: 'apple' | 'google'; idToken: string }
// 또는
{ provider: 'kakao'; accessToken: string }
```

**Response 200**
```ts
// 기존 유저
{ statusCode: 200, message: "로그인에 성공했습니다.",
  data: { isNewUser: false, accessToken: string, refreshToken: string,
          user: { id: number, nickname: string } } }

// 신규 유저
{ statusCode: 200, message: "신규 사용자입니다. 회원가입을 완료해주세요.",
  data: { isNewUser: true, signupToken: string, provider: 'apple' | 'google' | 'kakao' } }
```

**Errors**
- 400 `provider에 필요한 토큰이 누락되었습니다.` — Apple/Google에 `idToken` 없음, Kakao에 `accessToken` 없음
- 400 `지원하지 않는 OAuth 제공자입니다.` — `provider`가 `apple`/`google`/`kakao` 외의 값
- 401 `OAuth 토큰 검증에 실패했습니다.` — JWKS issuer/audience 불일치, Kakao API 호출 실패, 토큰 만료/위조 등

**Audience(aud) 검증**
- Apple: `APPLE_ALLOWED_AUDIENCES` (앱 Bundle Identifier, 예: `com.deciduel.app`)
- Google: `GOOGLE_ALLOWED_CLIENT_IDS` (네이티브 SDK `webClientId`/iOS/Android 클라이언트 ID, 콤마 구분 허용 목록)
- Kakao: `KAKAO_APP_ID` (Kakao Developers 앱 ID, `/v1/user/access_token_info` 응답의 `app_id`와 비교)
- env 미설정 시 검증을 스킵함 (로컬 개발 한정 — `OAUTH_AUDIENCE_REQUIRED=true` 또는 `NODE_ENV=production`에서는 allowlist 누락 시 401)

---

### POST `/auth/oauth/signup`

OAuth 신규 유저 회원가입 완료.

**Request body**
```ts
{ signupToken: string; nickname: string; termsVersion: string; privacyVersion: string }
```

**Response 201**
```ts
{ statusCode: 201, message: "회원가입에 성공했습니다.",
  data: { accessToken: string, refreshToken: string, user: { id: number, nickname: string } } }
```

**Errors**
- 401 `signupToken이 유효하지 않습니다` — 만료(15분) 또는 위조
- 409 `이미 가입된 계정입니다`

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

## 관리자 (Admin) — (2026-06-07 추가)

> **Phase 2 MVP.** 일반 유저 인증과 완전히 분리된 별도 시스템이다.
> - Admin JWT는 일반 유저 JWT(`JWT_SECRET`)와 **다른 secret**(`ADMIN_JWT_SECRET`)으로 서명되며, payload 형태도 다르다 (`{ type: 'admin', role: 'owner' }` vs `{ sub, nickname }`).
> - `AdminJwtGuard`/`AdminJwtStrategy`(`admin-jwt`)가 토큰 타입을 엄격히 구분 — 일반 유저 토큰으로는 `/admin/*` 보호 엔드포인트에 접근 불가 (401).
> - **앱(`deci-duel-app`)에서 호출할 일 없음** — 별도 관리자 도구/대시보드 전용. 일반 유저 플로우에 영향 없음.
> - 절대 로그/메타데이터에 남기지 않는 값: 관리자 접속 코드(`ADMIN_ACCESS_CODE`) 원문, JWT 토큰 원문.

### POST `/admin/auth/login`

관리자 접속 코드(`ADMIN_ACCESS_CODE`)를 검증해 admin 전용 JWT를 발급한다.

**인증**: 불필요 (코드 자체가 인증 수단)

**Request body**
```ts
{ code: string }  // 최소 1자
```

**Response 200**
```ts
{
  statusCode: 200,
  message: "관리자 로그인에 성공했습니다.",
  data: { accessToken: string; expiresIn: number }  // expiresIn: 초 단위, 기본 3600 (ADMIN_TOKEN_EXPIRES_IN으로 조정)
}
```

**Errors**
- 400 `code must be longer than or equal to 1 characters` — 코드 누락/빈 문자열
- 401 `관리자 코드가 올바르지 않습니다.` — 코드 불일치 또는 `ADMIN_ACCESS_CODE` 미설정
- 429 `잠시 후 다시 시도해주세요.` — 동일 IP 기준 5분 내 5회 실패 시 rate limit (메모리 기반, 서버 재시작 시 초기화)

> 로그인 성공 시 실패 카운터가 리셋된다. 코드 비교는 `timingSafeEqual` 기반 상수 시간 비교로 타이밍 사이드채널을 방지한다.

---

### GET `/admin/health`

서버 운영 상태 스냅샷 조회.

**인증**: Bearer 필요 (admin JWT, `AdminJwtGuard`)

**Response 200**
```ts
{
  statusCode: 200,
  message: "서버 상태 조회에 성공했습니다.",
  data: {
    ok: boolean;                 // db.status === 'ok'
    uptimeSeconds: number;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
    nodeEnv: string;
    serverVersion: string;       // package.json version
    db: { status: 'ok' | 'error'; latencyMs?: number };  // SELECT 1 라운드트립
    game: { roomCount: number; connectedSocketCount: number; activePlayerCount: number };
  }
}
```

**Errors**
- 401 — 토큰 없음 / 일반 유저 토큰 / 잘못된 secret으로 서명된 토큰 (admin 토큰이 아닌 모든 경우)

---

### GET `/admin/events`

`OperationalEvent` 운영 이벤트 조회 (커서 기반 페이지네이션).

**인증**: Bearer 필요 (admin JWT, `AdminJwtGuard`)

**Query params** (모두 선택)
```ts
{
  level?: 'info' | 'warn' | 'error';
  category?: 'auth' | 'admin' | 'http' | 'socket' | 'game' | 'system' | 'storage';
  event?: string;          // 정확히 일치
  userId?: number;
  requestId?: string;
  from?: string;           // ISO8601, createdAt >= from
  to?: string;             // ISO8601, createdAt <= to
  limit?: number;          // 기본 50, 최대 200 (초과 시 200으로 clamp)
  cursor?: number;         // 이전 응답의 nextCursor (id 기준)
}
```

**Response 200**
```ts
{
  statusCode: 200,
  message: "운영 이벤트 조회에 성공했습니다.",
  data: {
    items: Array<{
      id: number; level: string; category: string; event: string;
      message: string | null; userId: number | null; requestId: string | null;
      roomCode: string | null; metadata: unknown; createdAt: Date;
    }>;
    nextCursor: number | null;  // 다음 페이지 cursor (없으면 null)
    hasMore: boolean;
  }
}
```

**Errors**
- 401 — 토큰 없음 / 일반 유저 토큰

> **metadata 안전성**: `OperationalEventService.record()`가 저장 시 `accessToken`/`refreshToken`/`idToken`/`password`/`secret` 계열 키를 재귀적으로 `[REDACTED]`로 치환한다 (`sanitizeMetadata`). 토큰/코드/요청 본문 원문은 어떤 이벤트에도 절대 저장되지 않는다.

### OperationalEvent — 저장 대상 이벤트 (요약)

`category`별 주요 `event` 예시 (전체 목록은 코드 주석 참고):

| category | event 예시 |
|---|---|
| `admin` | `admin_login_success`, `admin_login_failed`, `admin_login_rate_limited` |
| `auth` | (기존 인증 흐름의 의미 있는 실패/성공 이벤트) |
| `socket` | `socket_connect_rejected`, `socket_connected`, `socket_disconnected`, `socket_reconnected` |
| `game` | `room_create_failed`, `room_created`, `room_join_failed`, `room_joined`, `round_mic_error`, `room_host_transferred`, `opponent_left`, `match_prepare_failed`, `game_forfeited`, `game_over` |

> **저장 기준**: "관리자에게 의미 있는" 이벤트만 선별 저장한다. `opponent:db` 같은 고빈도 실시간 스트림, heartbeat성 이벤트는 제외. 모든 raw HTTP 요청 로그도 DB에 저장하지 않는다 (구조화 로그로만 남김).
> **저장 실패 내성**: `record()`는 절대 throw하지 않는다 — DB 저장 실패 시에도 원 요청은 정상 처리되며, 실패 사실만 구조화 로그(`AppLogger`)로 남는다.

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
| 2026-06-07 | **Observability + Admin MVP (Codex 지시서 Phase 1+2)**: 모든 응답에 `requestId` 추가 (요청 추적, `x-request-id` 헤더 echo), 구조화 로깅(pino) 도입. `OperationalEvent` 도입 — 의미 있는 운영 이벤트만 DB 저장 (토큰/코드/요청 본문 원문 절대 미저장, 저장 실패가 원 요청에 영향 없음). 신규 Admin API 3종 추가: `POST /admin/auth/login`(접속 코드→admin JWT), `GET /admin/health`(서버 상태), `GET /admin/events`(운영 이벤트 조회). Admin JWT는 일반 유저 JWT와 완전 분리(별도 secret/payload/guard). 앱은 변경 불필요. | Claude |
