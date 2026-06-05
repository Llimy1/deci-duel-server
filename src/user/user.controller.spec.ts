import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { R2StorageService } from '../storage/r2-storage.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filter/http-exception.filter';
import { UserResponseMessage } from '../common/enum/reponse-message.enum';
import { UserExceptionMessage, AuthExceptionMessage } from '../common/exception/exception.message';

const TEST_SECRET = 'test-jwt-secret';

describe('UserController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockUserRepo = {
    existsByNickname: jest.fn(),
    findProfileByUserId: jest.fn(),
    updateNickname: jest.fn(),
    updateAvatarColor: jest.fn(),
    updateProfileImageKey: jest.fn(),
    deleteUser: jest.fn(),
    findUserByUserId: jest.fn(),
  };

  const mockR2Service = {
    uploadObject: jest.fn(),
    getSignedDownloadUrl: jest.fn(),
    deleteObject: jest.fn(),
  };

  const MOCK_PROFILE = {
    id: 1,
    nickname: '테스터',
    avatarColor: '#ff2d87',
    profileImageKey: null,
    streak: 3,
    wins: 5,
    losses: 2,
    createdAt: new Date('2024-01-01'),
    soloRecords: [{ bestDb: 95.5 }],
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_SECRET }),
      ],
      controllers: [UserController],
      providers: [
        UserService,
        JwtStrategy,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: R2StorageService, useValue: mockR2Service },
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
    accessToken = jwtService.sign({ sub: 1, nickname: '테스터' }, { expiresIn: '15m' });
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  /* ────────────────────────────────────────────────────────── */
  describe('GET /user/nickname/check', () => {
    it('200 - 사용 가능한 닉네임', async () => {
      mockUserRepo.existsByNickname.mockResolvedValue(false);

      const res = await request(app.getHttpServer())
        .get('/user/nickname/check')
        .query({ nickname: '새닉네임' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.NICKNAME_AVAILABLE);
      expect(res.body.data.available).toBe(true);
    });

    it('200 - 이미 존재하는 닉네임', async () => {
      mockUserRepo.existsByNickname.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .get('/user/nickname/check')
        .query({ nickname: '기존닉네임' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.NICKNAME_ALREADY_EXISTS);
      expect(res.body.data.available).toBe(false);
    });

    it('400 - nickname 쿼리 없음', async () => {
      const res = await request(app.getHttpServer())
        .get('/user/nickname/check');
      expect(res.status).toBe(400);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /user/me', () => {
    it('200 - 프로필 조회 성공 (프로필 이미지 없음)', async () => {
      mockUserRepo.findProfileByUserId.mockResolvedValue(MOCK_PROFILE);

      const res = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.ME_SUCCESS);
      expect(res.body.data).toMatchObject({
        id: 1,
        nickname: '테스터',
        avatarColor: '#ff2d87',
        profileImageUrl: null,
        streak: 3,
        wins: 5,
        losses: 2,
        bestDb: 95.5,
      });
    });

    it('200 - 프로필 이미지 있는 유저', async () => {
      const profileWithImage = { ...MOCK_PROFILE, profileImageKey: 'profiles/1/uuid.jpg' };
      mockUserRepo.findProfileByUserId.mockResolvedValue(profileWithImage);
      mockR2Service.getSignedDownloadUrl.mockResolvedValue('https://cdn.example.com/image.jpg');

      const res = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profileImageUrl).toBe('https://cdn.example.com/image.jpg');
    });

    it('404 - 존재하지 않는 유저', async () => {
      mockUserRepo.findProfileByUserId.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/user/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(AuthExceptionMessage.USER_NOT_FOUND);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).get('/user/me');
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('POST /user/me/profile-image', () => {
    it('200 - 이미지 업로드 성공', async () => {
      mockR2Service.uploadObject.mockResolvedValue(undefined);
      mockUserRepo.updateProfileImageKey.mockResolvedValue({ id: 1, profileImageKey: 'profiles/1/uuid.jpg' });
      mockR2Service.getSignedDownloadUrl.mockResolvedValue('https://cdn.example.com/image.jpg');

      const res = await request(app.getHttpServer())
        .post('/user/me/profile-image')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', Buffer.from('fake-image-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.PROFILE_IMAGE_UPDATE_SUCCESS);
      expect(res.body.data.profileImageUrl).toBe('https://cdn.example.com/image.jpg');
    });

    it('400 - 파일 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/user/me/profile-image')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });

    it('400 - 허용되지 않는 파일 형식 (gif)', async () => {
      const res = await request(app.getHttpServer())
        .post('/user/me/profile-image')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', Buffer.from('fake-gif-data'), {
          filename: 'test.gif',
          contentType: 'image/gif',
        });

      expect(res.status).toBe(400);
    });

    it('400/413 - 파일 크기 5MB 초과', async () => {
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);

      const res = await request(app.getHttpServer())
        .post('/user/me/profile-image')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('image', oversizedBuffer, {
          filename: 'big.jpg',
          contentType: 'image/jpeg',
        });

      // 서비스 레이어 검증(400) 또는 HTTP 레이어 크기 제한(413) 모두 허용
      expect([400, 413]).toContain(res.status);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/user/me/profile-image')
        .attach('image', Buffer.from('fake-image-data'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('PATCH /user/me/nickname', () => {
    it('200 - 닉네임 변경 성공', async () => {
      mockUserRepo.existsByNickname.mockResolvedValue(false);
      mockUserRepo.updateNickname.mockResolvedValue({ id: 1, nickname: '새닉네임' });

      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: '새닉네임' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.NICKNAME_UPDATE_SUCCESS);
      expect(res.body.data.nickname).toBe('새닉네임');
    });

    it('400 - nickname 필드 없음', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('400 - 1자 닉네임', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: 'a' });
      expect(res.status).toBe(400);
    });

    it('400 - 12자 초과 닉네임', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: 'a'.repeat(13) });
      expect(res.status).toBe(400);
    });

    it('400 - 특수문자 포함 닉네임', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: '닉네임!!' });
      expect(res.status).toBe(400);
    });

    it('409 - 이미 사용 중인 닉네임', async () => {
      mockUserRepo.existsByNickname.mockResolvedValue(true);

      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: '기존닉네임' });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(UserExceptionMessage.NICKNAME_ALREADY_EXISTS);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/nickname')
        .send({ nickname: '새닉네임' });
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('PATCH /user/me/avatar-color', () => {
    it('200 - 아바타 색상 변경 성공', async () => {
      mockUserRepo.updateAvatarColor.mockResolvedValue({ id: 1, avatarColor: '#00ffcc' });

      const res = await request(app.getHttpServer())
        .patch('/user/me/avatar-color')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarColor: '#00ffcc' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.AVATAR_COLOR_UPDATE_SUCCESS);
      expect(res.body.data.avatarColor).toBe('#00ffcc');
    });

    it('400 - 색상 코드 형식 오류 (이름만 전송)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/avatar-color')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarColor: 'red' });
      expect(res.status).toBe(400);
    });

    it('400 - # 없는 hex', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/avatar-color')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarColor: 'ff2d87' });
      expect(res.status).toBe(400);
    });

    it('400 - 3자리 축약형 hex', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/avatar-color')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ avatarColor: '#f2d' });
      expect(res.status).toBe(400);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .patch('/user/me/avatar-color')
        .send({ avatarColor: '#ff2d87' });
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('DELETE /user/me', () => {
    it('200 - 회원 탈퇴 성공', async () => {
      mockUserRepo.findUserByUserId.mockResolvedValue({
        id: 1,
        nickname: '테스터',
        refreshToken: null,
      });
      mockUserRepo.deleteUser.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/user/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(UserResponseMessage.DELETE_SUCCESS);
      expect(mockUserRepo.deleteUser).toHaveBeenCalledWith(1);
    });

    it('404 - 이미 탈퇴한 유저', async () => {
      mockUserRepo.findUserByUserId.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete('/user/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).delete('/user/me');
      expect(res.status).toBe(401);
    });
  });
});
