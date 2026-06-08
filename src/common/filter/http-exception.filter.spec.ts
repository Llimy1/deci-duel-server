import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, HttpExceptionFilter } from './http-exception.filter';
import { requestContextStorage } from '../context/request-context';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

/** AsyncLocalStorage 컨텍스트 안에서 콜백을 실행 — 실제 요청 흐름과 동일하게 requestId를 전파한다 */
function withRequestId<T>(requestId: string | undefined, fn: () => T): T {
  if (requestId === undefined) return fn();
  return requestContextStorage.run({ requestId }, fn);
}

describe('HttpExceptionFilter — requestId 응답 본문 포함', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('4xx 예외 응답 본문에 현재 컨텍스트의 requestId를 포함한다', () => {
    const { host, status, json } = makeHost();

    withRequestId('req_abc123', () => filter.catch(new BadRequestException('잘못된 요청'), host));

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = json.mock.calls[0][0];
    expect(body.requestId).toBe('req_abc123');
    expect(body.message).toBe('잘못된 요청');
  });

  it('requestId가 없는 컨텍스트에서도 응답이 깨지지 않는다 (undefined)', () => {
    const { host, json } = makeHost();

    filter.catch(new NotFoundException('없음'), host);

    const body = json.mock.calls[0][0];
    expect(body.requestId).toBeUndefined();
    expect(body.message).toBe('없음');
  });
});

describe('AllExceptionsFilter — requestId 응답 본문 포함 (모든 분기)', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('HttpException 분기에서 requestId를 포함한다', () => {
    const { host, json } = makeHost();

    withRequestId('req_http_1', () => filter.catch(new BadRequestException('http 분기'), host));

    expect(json.mock.calls[0][0].requestId).toBe('req_http_1');
  });

  it('Prisma KnownRequestError(P2002) 분기에서 requestId를 포함하고 409로 변환한다', () => {
    const { host, status, json } = makeHost();

    const prismaErr = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });

    withRequestId('req_prisma_1', () => filter.catch(prismaErr, host));

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = json.mock.calls[0][0];
    expect(body.requestId).toBe('req_prisma_1');
    expect(body.message).toBe('이미 존재하는 데이터입니다.');
  });

  it('Prisma ValidationError 분기에서 requestId를 포함하고 400으로 변환한다', () => {
    const { host, status, json } = makeHost();

    const validationErr = Object.create(Prisma.PrismaClientValidationError.prototype);
    validationErr.message = 'invalid args';

    withRequestId('req_prisma_2', () => filter.catch(validationErr, host));

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json.mock.calls[0][0].requestId).toBe('req_prisma_2');
  });

  it('알 수 없는 예외는 500으로 변환하고 requestId를 포함한다', () => {
    const { host, status, json } = makeHost();

    withRequestId('req_unknown_1', () => filter.catch(new Error('boom'), host));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = json.mock.calls[0][0];
    expect(body.requestId).toBe('req_unknown_1');
    expect(body.message).toBe('서버 오류가 발생했습니다.');
  });

  it('requestId가 없으면 응답 본문에서도 비어있고, 내부 에러 메시지/스택은 노출되지 않는다', () => {
    const { host, json } = makeHost();

    filter.catch(new Error('boom-internal-detail'), host);

    const body = json.mock.calls[0][0];
    expect(body.requestId).toBeUndefined();
    // 응답 본문에 스택트레이스/내부 에러 메시지가 노출되지 않아야 한다
    expect(JSON.stringify(body)).not.toContain('boom-internal-detail');
  });
});
