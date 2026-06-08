import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable } from 'rxjs';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminHealthService } from './admin-health.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { OperationalEventService } from '../common/operational-event/operational-event.service';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filter/http-exception.filter';
import { RequestContextMiddleware } from '../common/middleware/request-context.middleware';
import { getRequestContext, type RequestContextStore } from '../common/context/request-context';

const USER_SECRET = 'user-jwt-secret';
const ADMIN_SECRET = 'admin-jwt-secret';

/**
 * 가드 통과 직후(컨트롤러 진입 직전) request context 스냅샷을 캡처하는 테스트 전용 인터셉터.
 * `AdminJwtGuard.handleRequest()`가 setContextAdmin()을 호출해 컨텍스트에
 * actorType='admin'/adminRole을 반영하는지 검증하기 위한 용도.
 * (가드 → 인터셉터 → 컨트롤러 순으로 실행되므로 이 시점에 컨텍스트가 채워져 있어야 한다)
 */
const capturedContexts: Array<RequestContextStore | undefined> = [];

@Injectable()
class ContextCaptureInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    capturedContexts.push(getRequestContext());
    return next.handle();
  }
}

describe('AdminController (integration) — auth + health + events', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockAdminAuth = { login: jest.fn() };
  const mockAdminHealth = { getHealth: jest.fn() };
  const mockEvents = { record: jest.fn().mockResolvedValue(undefined), findMany: jest.fn() };

  const configMap: Record<string, string> = {
    JWT_SECRET: USER_SECRET,
    ADMIN_JWT_SECRET: ADMIN_SECRET,
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({})],
      controllers: [AdminController],
      providers: [
        AdminJwtStrategy,
        { provide: AdminAuthService, useValue: mockAdminAuth },
        { provide: AdminHealthService, useValue: mockAdminHealth },
        { provide: OperationalEventService, useValue: mockEvents },
        { provide: ConfigService, useValue: { get: (k: string) => configMap[k] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // requestId 전파 검증을 위해 RequestContextMiddleware를 전역 등록
    const requestContextMiddleware = new RequestContextMiddleware();
    app.use((req: any, res: any, next: any) => requestContextMiddleware.use(req, res, next));
    app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
    app.useGlobalInterceptors(new ContextCaptureInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    capturedContexts.length = 0;
  });

  const adminToken = () =>
    jwtService.sign({ type: 'admin', role: 'owner' }, { secret: ADMIN_SECRET, expiresIn: '1h' });
  const userToken = () =>
    jwtService.sign({ sub: 1, nickname: 'tester' }, { secret: USER_SECRET, expiresIn: '15m' });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /admin/auth/login', () => {
    it('200 - 로그인 성공 시 토큰/만료시간을 반환한다', async () => {
      mockAdminAuth.login.mockResolvedValue({ accessToken: 'issued.admin.jwt', expiresIn: 3600 });

      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ code: 'right-code' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ accessToken: 'issued.admin.jwt', expiresIn: 3600 });
      expect(typeof res.body.requestId).toBe('string');
      expect(res.body.requestId.length).toBeGreaterThan(0);
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
      expect(mockAdminAuth.login).toHaveBeenCalledWith('right-code', expect.any(String));
    });

    it('401 - 코드가 틀리면 실패 응답을 반환한다', async () => {
      mockAdminAuth.login.mockRejectedValue(
        new UnauthorizedException('관리자 코드가 올바르지 않습니다.'),
      );

      const res = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ code: 'wrong-code' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('관리자 코드가 올바르지 않습니다.');
    });

    it('400 - code 필드가 없으면 검증 오류', async () => {
      const res = await request(app.getHttpServer()).post('/admin/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /admin/health — 토큰 종류 판별', () => {
    it('401 - 토큰이 없으면 거부된다', async () => {
      const res = await request(app.getHttpServer()).get('/admin/health');
      expect(res.status).toBe(401);
      expect(mockAdminHealth.getHealth).not.toHaveBeenCalled();
    });

    it('401 - 일반 유저 JWT로는 접근할 수 없다 (payload.type !== admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/health')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(401);
      expect(mockAdminHealth.getHealth).not.toHaveBeenCalled();
    });

    it('401 - admin 시크릿이 아닌 다른 시크릿으로 서명된 토큰은 거부된다', async () => {
      const bogusToken = jwtService.sign(
        { type: 'admin', role: 'owner' },
        { secret: 'totally-different-secret', expiresIn: '1h' },
      );

      const res = await request(app.getHttpServer())
        .get('/admin/health')
        .set('Authorization', `Bearer ${bogusToken}`);

      expect(res.status).toBe(401);
    });

    it('200 - 유효한 admin JWT면 헬스 정보를 반환한다', async () => {
      mockAdminHealth.getHealth.mockResolvedValue({
        ok: true,
        uptimeSeconds: 10,
        memory: { rssMb: 1, heapUsedMb: 1, heapTotalMb: 1 },
        nodeEnv: 'test',
        serverVersion: '0.0.1',
        db: { status: 'ok', latencyMs: 1 },
        game: { roomCount: 0, connectedSocketCount: 0, activePlayerCount: 0 },
      });

      const res = await request(app.getHttpServer())
        .get('/admin/health')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);
      expect(mockAdminHealth.getHealth).toHaveBeenCalledTimes(1);

      // AdminJwtGuard.handleRequest()가 setContextAdmin()을 호출해
      // request context에 actorType='admin'/adminRole='owner'를 반영했는지 검증
      // (구조화 로그·OperationalEvent에서 admin 요청을 구분 추적하는 핵심 동작)
      expect(capturedContexts).toHaveLength(1);
      expect(capturedContexts[0]).toMatchObject({ actorType: 'admin', adminRole: 'owner' });
      expect(capturedContexts[0]?.userId).toBeUndefined();
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /admin/events — 토큰 검증 + 필터 위임', () => {
    it('401 - 토큰이 없으면 거부된다', async () => {
      const res = await request(app.getHttpServer()).get('/admin/events');
      expect(res.status).toBe(401);
      expect(mockEvents.findMany).not.toHaveBeenCalled();
    });

    it('401 - 일반 유저 JWT로는 접근할 수 없다', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .set('Authorization', `Bearer ${userToken()}`);

      expect(res.status).toBe(401);
      expect(mockEvents.findMany).not.toHaveBeenCalled();
    });

    it('200 - admin JWT면 쿼리 파라미터를 필터로 위임하고 결과를 반환한다', async () => {
      mockEvents.findMany.mockResolvedValue({
        items: [{ id: 1, level: 'warn', category: 'admin', event: 'admin_login_failed' }],
        nextCursor: null,
        hasMore: false,
      });

      const res = await request(app.getHttpServer())
        .get('/admin/events')
        .query({ level: 'warn', category: 'admin', limit: '20' })
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.hasMore).toBe(false);
      expect(mockEvents.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn', category: 'admin', limit: 20 }),
      );
    });
  });
});
