import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage, type RequestContextStore } from '../context/request-context';

const REQUEST_ID_HEADER = 'x-request-id';
/** 클라이언트가 보낸 값을 그대로 신뢰하지 않고 형식을 검증한다 (로그 인젝션/헤더 오염 방지) */
const VALID_REQUEST_ID = /^[a-zA-Z0-9_.-]{1,128}$/;

function resolveRequestId(headerValue: string | string[] | undefined): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (candidate && VALID_REQUEST_ID.test(candidate)) {
    return candidate;
  }
  return `req_${randomUUID()}`;
}

/**
 * 모든 HTTP 요청에 requestId를 부여하고 AsyncLocalStorage 컨텍스트로 전파한다.
 * - 클라이언트가 유효한 `x-request-id`를 보내면 그대로 유지
 * - 없거나 형식이 올바르지 않으면 서버가 생성 (`req_<uuid>`)
 * - 응답 헤더에도 `x-request-id`를 포함해 클라이언트가 추적할 수 있게 한다
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const store: RequestContextStore = {
      requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      path: req.originalUrl ?? req.url,
    };

    requestContextStorage.run(store, () => next());
  }
}
