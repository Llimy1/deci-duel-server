import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * HTTP 요청 단위 컨텍스트.
 * AsyncLocalStorage로 전파되어 request 객체를 직접 들고 다니지 않아도
 * 서비스/필터/인터셉터 깊은 곳에서 requestId/userId 등을 조회할 수 있다.
 *
 * 주의: 이 컨텍스트는 HTTP 요청 단위다. socket.io 이벤트는 requestId 대신
 * socketId/userId/roomCode 중심으로 추적한다 (game.gateway 참고).
 */
export interface RequestContextStore {
  requestId: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  /** Auth guard 통과 후 채워짐 (최초엔 비어있을 수 있음) */
  userId?: number;
  /**
   * 이 요청을 수행한 주체 (인증 guard 통과 후 채워짐).
   * - 'user': 일반 유저 JWT 인증 성공 (`userId` 동반)
   * - 'admin': admin JWT 인증 성공 (`adminRole` 동반)
   * - undefined: 미인증 요청 (로그인 등 guard를 거치지 않은 경로)
   */
  actorType?: 'user' | 'admin';
  /** admin 인증 성공 시 채워짐 (예: 'owner') */
  adminRole?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

/** 현재 요청 컨텍스트 전체를 반환한다. 컨텍스트 밖이면 undefined. */
export function getRequestContext(): RequestContextStore | undefined {
  return requestContextStorage.getStore();
}

/** 현재 요청의 requestId. 컨텍스트 밖이면 undefined. */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/** 현재 요청의 인증된 userId. 컨텍스트 밖이거나 미인증이면 undefined. */
export function getContextUserId(): number | undefined {
  return requestContextStorage.getStore()?.userId;
}

/** 현재 요청의 actor 타입('user' | 'admin'). 컨텍스트 밖이거나 미인증이면 undefined. */
export function getActorType(): 'user' | 'admin' | undefined {
  return requestContextStorage.getStore()?.actorType;
}

/** 현재 요청의 admin role (admin 인증된 경우만). 그 외엔 undefined. */
export function getAdminRole(): string | undefined {
  return requestContextStorage.getStore()?.adminRole;
}

/**
 * 일반 유저 JWT 인증 성공 후 userId/actorType을 컨텍스트에 반영한다.
 * (`JwtAuthGuard.handleRequest()`에서 호출 — guard가 인증 결과를 확정하는 지점이 가장 명확하다)
 */
export function setContextUserId(userId: number): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.userId = userId;
    store.actorType = 'user';
  }
}

/**
 * admin JWT 인증 성공 후 actorType/adminRole을 컨텍스트에 반영한다.
 * (`AdminJwtGuard.handleRequest()`에서 호출)
 */
export function setContextAdmin(role: string): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.actorType = 'admin';
    store.adminRole = role;
  }
}
