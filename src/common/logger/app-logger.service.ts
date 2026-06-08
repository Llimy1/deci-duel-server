import { Injectable, LoggerService } from '@nestjs/common';
import type { Level } from 'pino';
import { rootLogger } from './pino.instance';
import { getRequestContext } from '../context/request-context';

/**
 * NestJS LoggerService 구현체 — pino JSON structured logging으로 교체.
 * `app.useLogger(new AppLogger())`로 Nest 내부 로거(부트스트랩 로그 등)까지 통일한다.
 *
 * 기존 `new Logger(SomeClass.name)` 호출부도 Nest가 내부적으로 이 LoggerService를
 * 사용하도록 위임하므로, 별도 리팩터링 없이 JSON 포맷 + requestId/userId 컨텍스트가
 * 자동으로 묻어난다.
 */
@Injectable()
export class AppLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    this.emit('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.emit('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.emit('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    this.emit('fatal', message, optionalParams);
  }

  /**
   * HTTP access log 등 정형 필드를 1급 JSON 필드로 남기고 싶을 때 사용.
   * statusCode>=500이면 error, 4xx면 warn, 그 외는 info 레벨로 기록한다.
   */
  structured(fields: Record<string, unknown>, message: string) {
    const status = fields.statusCode;
    const level: Level =
      typeof status === 'number' && status >= 500
        ? 'error'
        : typeof status === 'number' && status >= 400
          ? 'warn'
          : 'info';
    rootLogger[level](fields, message);
  }

  private emit(level: Level, message: unknown, optionalParams: unknown[]) {
    const store = getRequestContext();

    // Nest 컨벤션: error(message, trace?, context?) / log(message, context?)
    // optionalParams 끝에 문자열이 오면 context로, error의 경우 그 앞은 stack trace로 본다.
    let context: string | undefined;
    let stack: string | undefined;
    if (optionalParams.length > 0) {
      const last = optionalParams[optionalParams.length - 1];
      if (typeof last === 'string') context = last;
    }
    if (level === 'error' || level === 'fatal') {
      const firstParam = optionalParams[0];
      if (firstParam instanceof Error) {
        stack = firstParam.stack ?? firstParam.message;
      } else if (optionalParams.length > 1 && typeof firstParam === 'string') {
        stack = firstParam;
      } else if (optionalParams.length === 1 && typeof firstParam === 'string' && context === firstParam) {
        // error(message, context) 형태 — trace 없음
        stack = undefined;
      }
    }

    rootLogger[level](
      {
        requestId: store?.requestId,
        userId: store?.userId,
        actorType: store?.actorType,
        adminRole: store?.adminRole,
        context,
        ...(stack ? { stack } : {}),
      },
      typeof message === 'string' ? message : safeStringify(message),
    );
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
