import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { AppLogger } from '../logger/app-logger.service';
import { getRequestContext } from '../context/request-context';

/**
 * 모든 HTTP 요청/응답을 구조화된 JSON 한 줄 로그로 남긴다.
 * 응답이 끝나는 시점(`res.finish`)에 statusCode/durationMs까지 포함해 한 번에 기록한다.
 *
 * 필드: level, time, msg, requestId, userId, method, path, statusCode, durationMs, ip, userAgent
 * body/token 등은 절대 포함하지 않는다.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    let logged = false;
    const writeAccessLog = () => {
      if (logged) return;
      logged = true;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const store = getRequestContext();

      this.logger.structured(
        {
          requestId: store?.requestId,
          userId: store?.userId,
          actorType: store?.actorType,
          adminRole: store?.adminRole,
          method: req.method,
          path: store?.path ?? req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          ip: store?.ip ?? req.ip,
          userAgent: store?.userAgent ?? req.headers['user-agent'],
        },
        `${req.method} ${store?.path ?? req.originalUrl ?? req.url} ${res.statusCode} ${Math.round(durationMs)}ms`,
      );
    };

    res.once('finish', writeAccessLog);
    res.once('close', writeAccessLog);

    return next.handle();
  }
}
