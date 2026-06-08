jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  Injectable,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable } from 'rxjs';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from '../user/user.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filter/http-exception.filter';
import { AuthResponseMessage } from '../common/enum/reponse-message.enum';
import { AuthExceptionMessage } from '../common/exception/exception.message';
import { UnauthorizedException } from '../common/exception/custom.exception';
import { OperationalEventService } from '../common/operational-event/operational-event.service';
import { getRequestContext, type RequestContextStore } from '../common/context/request-context';
import { RequestContextMiddleware } from '../common/middleware/request-context.middleware';

const TEST_SECRET = 'test-jwt-secret';

/**
 * 가드 통과 직후(컨트롤러 진입 직전) request context 스냅샷을 캡처하는 테스트 전용 인터셉터.
 * `JwtAuthGuard.handleRequest()`가 setContextUserId()를 호출해 컨텍스트에
 * userId/actorType을 채워 넣는지 — 즉 "인증된 일반 유저 요청 후 컨텍스트에 userId가
 * 포함되는지"를 검증하기 위한 용도. (가드 → 인터셉터 → 컨트롤러 순으로 실행됨)
 */
const capturedContexts: Array<RequestContextStore | undefined> = [];

@Injectable()
class ContextCaptureInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    capturedContexts.push(getRequestContext());
    return next.handle();
  }
}

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockUserRepo = {
    findByProvider: jest.fn(),
    createOAuthUser: jest.fn(),
    updateRefreshToken: jest.fn(),
    findUserByUserId: jest.fn(),
  };

  // AuthService의 verifyOAuthToken을 spy로 교체 (외부 네트워크 호출 없이 테스트)
  let authService: AuthService;

  const mockOperationalEvents = { record: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_SECRET }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
        { provide: OperationalEventService, useValue: mockOperationalEvents },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // request context(AsyncLocalStorage)가 실제 런타임처럼 채워지도록 미들웨어 등록
    // (이게 없으면 JwtAuthGuard.handleRequest()의 setContextUserId() 호출이
    //  활성 store가 없어 아무 효과도 내지 못하고, getRequestContext()가 undefined를 반환함)
    const requestContextMiddleware = new RequestContextMiddleware();
    app.use((req: any, res: any, next: any) => requestContextMiddleware.use(req, res, next));
    app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
    app.useGlobalInterceptors(new ContextCaptureInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jwtService = moduleRef.get(JwtService);
    authService = moduleRef.get(AuthService);
  });

  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    capturedContexts.length = 0;
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/oauth — 기존 유저 로그인', () => {
    it('200 - 기존 유저 로그인 성공 (kakao)', async () => {
      jest.spyOn(authService as any, 'verifyOAuthToken').mockResolvedValue('kakao-user-123');
      mockUserRepo.findByProvider.mockResolvedValue({ id: 1, nickname: '테스터', refreshToken: null });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/oauth')
        .send({ provider: 'kakao', accessToken: 'kakao_token' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(AuthResponseMessage.LOGIN_SUCCESS);
      expect(res.body.data.isNewUser).toBe(false);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('200 - 신규 유저 → signupToken 반환', async () => {
      jest.spyOn(authService as any, 'verifyOAuthToken').mockResolvedValue('kakao-new-456');
      mockUserRepo.findByProvider.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/auth/oauth')
        .send({ provider: 'kakao', accessToken: 'kakao_token' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(AuthResponseMessage.OAUTH_NEW_USER);
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data).toHaveProperty('signupToken');
      expect(res.body.data.provider).toBe('kakao');
    });

    it('400 - 지원하지 않는 provider', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/oauth')
        .send({ provider: 'twitter', accessToken: 'token' });
      expect(res.status).toBe(400);
    });

    it('400 - provider 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/oauth')
        .send({ accessToken: 'token' });
      expect(res.status).toBe(400);
    });

    it('401 - OAuth 토큰 검증 실패', async () => {
      jest.spyOn(authService as any, 'verifyOAuthToken').mockRejectedValue(
        new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/oauth')
        .send({ provider: 'apple', idToken: 'invalid_token' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/oauth/signup', () => {
    it('201 - OAuth 신규 가입 완료', async () => {
      const signupToken = jwtService.sign(
        { sub: 'oauth_signup', provider: 'kakao', providerId: 'kakao-new-456' },
        { expiresIn: '15m' },
      );
      mockUserRepo.findByProvider.mockResolvedValue(null);
      mockUserRepo.createOAuthUser.mockResolvedValue({ id: 10, nickname: '새유저' });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/oauth/signup')
        .send({ signupToken, nickname: '새유저', termsVersion: '1.0', privacyVersion: '1.0' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe(AuthResponseMessage.SIGNUP_SUCCESS);
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.user).toEqual({ id: 10, nickname: '새유저' });
    });

    it('401 - 만료된 signupToken', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'oauth_signup', provider: 'kakao', providerId: 'id' },
        { expiresIn: '0s' },
      );

      const res = await request(app.getHttpServer())
        .post('/auth/oauth/signup')
        .send({ signupToken: expiredToken, nickname: '유저', termsVersion: '1.0', privacyVersion: '1.0' });

      expect(res.status).toBe(401);
    });

    it('400 - 필드 누락', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/oauth/signup')
        .send({ signupToken: 'token', nickname: '유저' });
      expect(res.status).toBe(400);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/refresh', () => {
    it('200 - 토큰 재발급 성공', async () => {
      const refreshToken = jwtService.sign({ sub: 1 }, { expiresIn: '30d' });
      mockUserRepo.findUserByUserId.mockResolvedValue({
        id: 1,
        nickname: '테스터',
        refreshToken,
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(AuthResponseMessage.REFRESH_SUCCESS);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('400 - refreshToken 필드 없음', async () => {
      const res = await request(app.getHttpServer()).post('/auth/refresh').send({});
      expect(res.status).toBe(400);
    });

    it('401 - 유효하지 않은 토큰', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid.jwt.string' });
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/logout', () => {
    it('200 - 로그아웃 성공', async () => {
      const accessToken = jwtService.sign({ sub: 1, nickname: '테스터' }, { expiresIn: '15m' });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(AuthResponseMessage.LOGOUT_SUCCESS);
      expect(mockUserRepo.updateRefreshToken).toHaveBeenCalledWith(1, null);

      // JwtAuthGuard.handleRequest()가 setContextUserId()를 호출해
      // request context에 userId/actorType='user'를 반영했는지 검증
      // (구조화 로그·OperationalEvent의 actor 추적 근거가 되는 핵심 동작)
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0]).toMatchObject({ userId: 1, actorType: 'user' });
      expect(capturedContexts[0]?.adminRole).toBeUndefined();
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(401);
    });
  });
});
