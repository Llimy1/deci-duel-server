import { rootLogger } from './pino.instance';
import { AppLogger } from './app-logger.service';
import { requestContextStorage } from '../context/request-context';

jest.mock('./pino.instance', () => {
  const fn = () => jest.fn();
  return {
    rootLogger: { info: fn(), error: fn(), warn: fn(), debug: fn(), trace: fn(), fatal: fn() },
  };
});

const mockRoot = rootLogger as unknown as Record<string, jest.Mock>;

describe('AppLogger — requestId/userId 컨텍스트 자동 포함', () => {
  let logger: AppLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new AppLogger();
  });

  it('컨텍스트가 있으면 모든 로그 레벨에 requestId/userId를 자동으로 포함한다', () => {
    requestContextStorage.run({ requestId: 'req_xyz', userId: 42 }, () => {
      logger.log('정보 로그', 'SomeContext');
    });

    expect(mockRoot.info).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req_xyz', userId: 42, context: 'SomeContext' }),
      '정보 로그',
    );
  });

  it('컨텍스트 밖에서는 requestId/userId가 undefined로 채워진다 (응답이 깨지지 않음)', () => {
    logger.warn('컨텍스트 없음');

    expect(mockRoot.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: undefined, userId: undefined }),
      '컨텍스트 없음',
    );
  });

  it('일반 유저 인증 컨텍스트(actorType=user)가 있으면 actorType/adminRole도 로그 필드에 포함한다', () => {
    requestContextStorage.run(
      { requestId: 'req_user', userId: 7, actorType: 'user' },
      () => {
        logger.log('유저 요청 처리', 'SomeService');
      },
    );

    expect(mockRoot.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_user',
        userId: 7,
        actorType: 'user',
        adminRole: undefined,
      }),
      '유저 요청 처리',
    );
  });

  it('admin 인증 컨텍스트(actorType=admin)가 있으면 actorType/adminRole이 로그 필드에 포함된다', () => {
    requestContextStorage.run(
      { requestId: 'req_admin', actorType: 'admin', adminRole: 'owner' },
      () => {
        logger.log('admin 요청 처리', 'AdminService');
      },
    );

    expect(mockRoot.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_admin',
        actorType: 'admin',
        adminRole: 'owner',
      }),
      'admin 요청 처리',
    );
  });

  it('error(message, stack, context) 형태에서 stack을 분리해 별도 필드로 남긴다', () => {
    requestContextStorage.run({ requestId: 'req_err' }, () => {
      logger.error('실패함', 'Error: boom\n  at x', 'FailingService');
    });

    const [fields, msg] = mockRoot.error.mock.calls[0];
    expect(msg).toBe('실패함');
    expect(fields.requestId).toBe('req_err');
    expect(fields.context).toBe('FailingService');
    expect(fields.stack).toBe('Error: boom\n  at x');
  });

  it('error(message, Error, context) 형태에서도 Error stack을 별도 필드로 남긴다', () => {
    const error = new Error('boom');

    requestContextStorage.run({ requestId: 'req_error_object' }, () => {
      logger.error('실패함', error, 'FailingService');
    });

    const [fields, msg] = mockRoot.error.mock.calls[0];
    expect(msg).toBe('실패함');
    expect(fields.requestId).toBe('req_error_object');
    expect(fields.context).toBe('FailingService');
    expect(fields.stack).toContain('Error: boom');
  });

  it('verbose는 pino trace 레벨로 위임된다', () => {
    logger.verbose('상세 로그');
    expect(mockRoot.trace).toHaveBeenCalled();
  });

  describe('structured — HTTP access log', () => {
    it('statusCode>=500이면 error 레벨로 기록한다', () => {
      logger.structured({ statusCode: 503, method: 'GET', path: '/x' }, 'http access');
      expect(mockRoot.error).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 503 }),
        'http access',
      );
    });

    it('statusCode 4xx면 warn 레벨로 기록한다', () => {
      logger.structured({ statusCode: 404 }, 'not found');
      expect(mockRoot.warn).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }), 'not found');
    });

    it('statusCode 2xx면 info 레벨로 기록한다', () => {
      logger.structured({ statusCode: 200 }, 'ok');
      expect(mockRoot.info).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 200 }), 'ok');
    });
  });

  it('절대 accessToken/refreshToken/password 등 민감 필드를 직접 필드로 추가하지 않는다 (호출부 책임 + redact 안전망)', () => {
    requestContextStorage.run({ requestId: 'req_safe' }, () => {
      logger.log('로그인 시도', 'AuthService');
    });

    const [fields] = mockRoot.info.mock.calls[0];
    expect(fields).not.toHaveProperty('accessToken');
    expect(fields).not.toHaveProperty('refreshToken');
    expect(fields).not.toHaveProperty('password');
  });
});
