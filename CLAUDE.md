# DeciDuel Server

## 역할 정의
너는 DeciDuel 백엔드 전담 개발자다. (앱은 Codex가 담당)
작업 중 질문하지 마라.
모호한 경우 가장 합리적인 방향으로 판단하고
결정 이유를 docs/progress.md Decision Log에 기록해라.
예외 처리와 에러 핸들링은 항상 포함해라.
코드 수정 전 반드시 관련 파일을 먼저 스캔해라.
API 변경 시 반드시 docs/api.md도 동기화해라.

## 기술 스택
- Runtime: Node.js 20, TypeScript 5
- Framework: NestJS 10
- DB: PostgreSQL 15 + Prisma 6
- Realtime: socket.io 4 (namespace: /game)
- Storage: Cloudflare R2 (presigned URL, 1시간 유효)
- Auth: JWT (access 15m, refresh 30d, rotation ON)
- Test: Jest (unit + integration)
- Infra: Docker Compose (deci-duel-postgres:5432)

## 디렉토리 구조
```
src/
├── auth/          # JWT 인증 (signup, login, refresh, logout)
├── user/          # 프로필, 닉네임, 아바타, 프로필 이미지
├── game/          # WebSocket GameGateway (/game namespace)
│   ├── game.gateway.ts        # 핵심: 방 생성/참여, 게임 진행, forfeit
│   ├── game-room.store.ts     # 인메모리 상태 (rooms, socketToRoom, userToRoom)
│   ├── game.module.ts
│   └── types/game.types.ts   # GameState, PlayerInfo, GameRoom 등
├── record/        # 솔로 기록 (SoloRecord)
├── diary/         # 다이어리 (DiaryRecord)
├── storage/       # Cloudflare R2 업로드
├── common/        # 공통 필터, 인터셉터, DTO
├── prisma/        # PrismaService
└── app.module.ts
```

## DB 스키마 (Prisma)
- User: id, devId, devPassword, nickname(unique), authProvider, refreshToken,
        avatarColor(#ff2d87), profileImageKey, streak, wins, losses
- SoloRecord: userId(unique), peakDb, bestDb
- DiaryRecord: userId+date(unique), peakDb, emoji, comment, date

## 코딩 원칙
- Feature module 패턴 (각 도메인 = 독립 모듈)
- DTO에 class-validator 반드시 적용
- 에러는 HttpException 상속 커스텀 예외
- 응답은 항상 ApiResponse<T> 래핑
- Prisma로만 DB 접근 (raw query 최소화)
- 환경변수는 ConfigService로 주입 (process.env 직접 사용 금지)
- 하드코딩 금지

## WebSocket 이벤트 (Phase 2)
### Client → Server (/game namespace)
| Event | Payload | 설명 |
|-------|---------|------|
| room:create | - | 방 생성 (6자리 코드 발급) |
| room:join | { roomCode } | 방 참여 |
| game:ready | - | 준비 완료 |
| round:submit | { peakDb: number } | 라운드 측정값 제출 (0-200 clamp) |

### Server → Client
| Event | Payload | 설명 |
|-------|---------|------|
| room:created | { roomCode, player } | 방 생성 완료 |
| room:joined | { roomCode, players } | 참여 완료 |
| opponent:joined | { opponent } | 상대 입장 알림 |
| countdown:tick | { count } | 카운트다운 3,2,1,0 |
| round:start | { round, totalRounds } | 라운드 시작 (5.5초 타이머) |
| round:result | { round, myDb, oppDb, myScore, oppScore, winner } | 라운드 결과 |
| game:over | { winnerId, scores, forfeit? } | 게임 종료 |
| room:reconnected | { room, player } | 재연결 성공 |
| opponent:reconnected | { opponent } | 상대 재연결 알림 |

## 세션 시작 시 필수 절차
1. claude-brain get_context(['nestjs', 'typescript', 'postgresql', 'socket.io']) 호출
2. 반환된 Gotchas와 패턴을 컨텍스트에 로드
3. docs/progress.md 에서 현재 상태 확인

## 작업 흐름
1. 아키텍처 결정 전: /plan-eng-review
2. 새 모듈 생성 시: /scaffold
3. 구현 완료 후: /ship
4. PR 전: /review
5. docs/progress.md 업데이트
6. docs/api.md 업데이트 (엔드포인트 변경 시)
7. claude-brain end_session() 호출

## Skills 호출 규칙
### GStack (범용)
- 제품 방향 결정 전: /plan-ceo-review
- 아키텍처 결정 전: /plan-eng-review
- 구현 완료 후: /ship
- PR 전: /review
- QA 필요 시: /qa

### 글로벌 Skills
- NestJS 작업 시: /nestjs
- PostgreSQL 작업 시: /postgresql
- Docker 작업 시: /docker

### 프로젝트 고유 Skills
- 라이브러리 사용 전: /library-sdk
- 버그 발생 시: /debugging
- DB 작업 시: /data-monitoring
- 새 모듈 생성 시: /scaffold
- 배포 작업 시: /devops
- 운영 유지보수 시: /ops

## 자동 학습 규칙 (중요)
아래 상황 발생 시 즉시 처리. 질문하지 말고 직접 실행:

### Gotcha 발견 시
1. claude-brain save_gotcha() 즉시 호출
2. 해당 글로벌 skill 파일 Gotchas 섹션에도 추가
3. AGENTS.md 과거 실패 기록에도 추가

### 패턴 발견 시 (문제 해결 완료 후)
1. claude-brain save_pattern() 호출
2. 관련 skill 파일에도 반영

### 아키텍처 결정 시
1. claude-brain save_decision() 호출
2. docs/progress.md Decision Log에도 기록

## 금지 사항
- 작업 중 사용자에게 질문하지 않는다
- 파일 스캔 없이 코드 수정하지 않는다
- 협업 채널(docs/api.md, docs/CLAUDE_TO_CODEX.md) 규칙 밖 변경하지 않는다
- /ship 없이 완료로 표시하지 않는다
- /review 없이 PR 만들지 않는다
- claude-brain 호출 없이 세션 종료하지 않는다
- Prisma 마이그레이션 없이 스키마 변경하지 않는다
