import type { Request, Response } from 'express';
import { RequestContextMiddleware } from './request-context.middleware';
import { getRequestContext, getRequestId, requestContextStorage } from '../context/request-context';

const REQUEST_ID_HEADER = 'x-request-id';

function makeReqRes(headers: Record<string, string | string[] | undefined> = {}) {
  const setHeader = jest.fn();
  const req = {
    headers,
    ip: '127.0.0.1',
    method: 'GET',
    originalUrl: '/admin/health',
    url: '/admin/health',
  } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('RequestContextMiddleware', () => {
  let middleware: RequestContextMiddleware;

  beforeEach(() => {
    middleware = new RequestContextMiddleware();
  });

  it('클라이언트가 유효한 x-request-id를 보내면 그대로 사용하고 응답 헤더에 반영한다', () => {
    const { req, res, setHeader } = makeReqRes({ [REQUEST_ID_HEADER]: 'client-req-id.123' });

    let capturedId: string | undefined;
    middleware.use(req, res, () => {
      capturedId = getRequestId();
    });

    expect(capturedId).toBe('client-req-id.123');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'client-req-id.123');
  });

  it('x-request-id가 없으면 서버가 req_<uuid> 형식으로 생성한다', () => {
    const { req, res, setHeader } = makeReqRes({});

    let capturedId: string | undefined;
    middleware.use(req, res, () => {
      capturedId = getRequestId();
    });

    expect(capturedId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, capturedId);
  });

  it('형식이 올바르지 않은 x-request-id는 거부하고 새로 생성한다 (헤더 인젝션 방지)', () => {
    const { req, res, setHeader } = makeReqRes({
      [REQUEST_ID_HEADER]: 'bad value\r\nX-Injected: evil',
    });

    let capturedId: string | undefined;
    middleware.use(req, res, () => {
      capturedId = getRequestId();
    });

    expect(capturedId).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, capturedId);
  });

  it('AsyncLocalStorage 컨텍스트로 ip/method/path 등 메타데이터를 전파한다', () => {
    const { req, res } = makeReqRes({});

    let ctx: ReturnType<typeof getRequestContext>;
    middleware.use(req, res, () => {
      ctx = getRequestContext();
    });

    expect(ctx).toMatchObject({
      ip: '127.0.0.1',
      method: 'GET',
      path: '/admin/health',
    });
    expect(ctx?.requestId).toBeDefined();
  });

  it('미들웨어 컨텍스트 밖에서는 requestId가 없다', () => {
    expect(requestContextStorage.getStore()).toBeUndefined();
    expect(getRequestId()).toBeUndefined();
  });

  it('각 요청마다 독립된 컨텍스트를 가진다 (요청 간 누수 없음)', () => {
    const { req: req1, res: res1 } = makeReqRes({ [REQUEST_ID_HEADER]: 'req-one' });
    const { req: req2, res: res2 } = makeReqRes({ [REQUEST_ID_HEADER]: 'req-two' });

    let id1: string | undefined;
    let id2: string | undefined;

    middleware.use(req1, res1, () => {
      id1 = getRequestId();
    });
    middleware.use(req2, res2, () => {
      id2 = getRequestId();
    });

    expect(id1).toBe('req-one');
    expect(id2).toBe('req-two');
    expect(getRequestId()).toBeUndefined();
  });
});
