import { Injectable } from '@nestjs/common';

interface AttemptRecord {
  count: number;
  firstAttemptAt: number;
}

const DEFAULT_WINDOW_MS = 5 * 60_000; // 5분
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * 동일 IP 기준 admin 로그인 실패를 메모리에서 추적하는 MVP rate limiter.
 * 서버 재시작 시 초기화되는 것을 허용한다 (Codex 지시 — MVP에서는 메모리 기반으로 충분).
 */
@Injectable()
export class AdminLoginRateLimiter {
  private readonly attempts = new Map<string, AttemptRecord>();

  constructor(
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  ) {}

  isBlocked(key: string): boolean {
    const record = this.attempts.get(key);
    if (!record) return false;
    if (this.isExpired(record)) {
      this.attempts.delete(key);
      return false;
    }
    return record.count >= this.maxAttempts;
  }

  registerFailure(key: string): void {
    const now = Date.now();
    const record = this.attempts.get(key);
    if (!record || this.isExpired(record)) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now });
      return;
    }
    record.count += 1;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private isExpired(record: AttemptRecord): boolean {
    return Date.now() - record.firstAttemptAt > this.windowMs;
  }
}
