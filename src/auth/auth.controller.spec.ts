import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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

const TEST_SECRET = 'test-jwt-secret';

describe('AuthController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const mockUserRepo = {
    findUserByDevId: jest.fn(),
    devSignup: jest.fn(),
    updateRefreshToken: jest.fn(),
    findUserByUserId: jest.fn(),
  };

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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jwtService = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/dev/signup', () => {
    const VALID_BODY = { id: 'testdev01', password: 'password123', nickname: '테스터', termsVersion: '1.0', privacyVersion: '1.0' };

    it('201 - 정상 회원가입', async () => {
      mockUserRepo.findUserByDevId.mockResolvedValue(null);
      mockUserRepo.devSignup.mockResolvedValue({ id: 1, nickname: '테스터' });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe(AuthResponseMessage.SIGNUP_SUCCESS);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user).toEqual({ id: 1, nickname: '테스터' });
    });

    it('400 - id 4자 미만', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send({ ...VALID_BODY, id: 'abc' });
      expect(res.status).toBe(400);
    });

    it('400 - password 6자 미만', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send({ ...VALID_BODY, password: '12345' });
      expect(res.status).toBe(400);
    });

    it('400 - nickname 2자 미만', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send({ ...VALID_BODY, nickname: 'a' });
      expect(res.status).toBe(400);
    });

    it('400 - nickname 특수문자 포함', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send({ ...VALID_BODY, nickname: 'user!!' });
      expect(res.status).toBe(400);
    });

    it('400 - 필드 누락', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send({});
      expect(res.status).toBe(400);
    });

    it('409 - 이미 존재하는 devId', async () => {
      mockUserRepo.findUserByDevId.mockResolvedValue({ id: 99, nickname: 'existing' });

      const res = await request(app.getHttpServer())
        .post('/auth/dev/signup')
        .send(VALID_BODY);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(AuthExceptionMessage.DUPLICATE_ID);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /auth/dev/login', () => {
    const VALID_BODY = { id: 'testdev01', password: 'password123' };

    it('200 - 정상 로그인', async () => {
      mockUserRepo.findUserByDevId.mockResolvedValue({
        id: 1,
        nickname: '테스터',
        devPassword: 'password123',
      });
      mockUserRepo.updateRefreshToken.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/auth/dev/login')
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(AuthResponseMessage.LOGIN_SUCCESS);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('400 - 빈 body', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/dev/login')
        .send({});
      expect(res.status).toBe(400);
    });

    it('404 - 존재하지 않는 유저', async () => {
      mockUserRepo.findUserByDevId.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/auth/dev/login')
        .send(VALID_BODY);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(AuthExceptionMessage.USER_NOT_FOUND);
    });

    it('401 - 비밀번호 틀림', async () => {
      mockUserRepo.findUserByDevId.mockResolvedValue({
        id: 1,
        nickname: '테스터',
        devPassword: 'correct_password',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/dev/login')
        .send({ id: 'testdev01', password: 'wrong_password' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(AuthExceptionMessage.INVALID_PASSWORD);
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
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('400 - refreshToken 필드 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({});
      expect(res.status).toBe(400);
    });

    it('401 - 유효하지 않은 토큰 문자열', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid.jwt.string' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(AuthExceptionMessage.INVALID_TOKEN);
    });

    it('401 - 저장된 토큰과 불일치', async () => {
      const refreshToken = jwtService.sign({ sub: 1 }, { expiresIn: '30d' });
      mockUserRepo.findUserByUserId.mockResolvedValue({
        id: 1,
        nickname: '테스터',
        refreshToken: 'different-stored-token',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe(AuthExceptionMessage.INVALID_TOKEN);
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
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout');
      expect(res.status).toBe(401);
    });

    it('401 - 만료된 토큰', async () => {
      const expiredToken = jwtService.sign({ sub: 1, nickname: '테스터' }, { expiresIn: '0s' });

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });
  });
});
