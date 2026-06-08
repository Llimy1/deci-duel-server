export type OperationalEventLevel = 'info' | 'warn' | 'error';

export type OperationalEventCategory =
  | 'auth'
  | 'admin'
  | 'http'
  | 'socket'
  | 'game'
  | 'system'
  | 'storage';

export interface RecordOperationalEventInput {
  level: OperationalEventLevel;
  category: OperationalEventCategory;
  event: string;
  message?: string | null;
  userId?: number | null;
  /** 미지정 시 현재 요청 컨텍스트(AsyncLocalStorage)의 requestId를 자동으로 채운다 */
  requestId?: string | null;
  roomCode?: string | null;
  /** token/secret/body 원문 절대 금지 — record() 내부에서 한 번 더 정제(sanitize)한다 */
  metadata?: Record<string, unknown> | null;
}

export interface OperationalEventFilter {
  level?: string;
  category?: string;
  event?: string;
  userId?: number;
  requestId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  /** 이전 페이지의 마지막 id (exclusive) */
  cursor?: number;
}
