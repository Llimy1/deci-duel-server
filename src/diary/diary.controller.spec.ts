import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { DiaryRepository } from './diary.repository';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AllExceptionsFilter, HttpExceptionFilter } from '../common/filter/http-exception.filter';
import { DiaryResponseMessage } from '../common/enum/reponse-message.enum';
import { DiaryExceptionMessage } from '../common/exception/exception.message';

const TEST_SECRET = 'test-jwt-secret';

describe('DiaryController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockDiaryRepo = {
    upsertDiary: jest.fn(),
    findMonthlyDiary: jest.fn(),
    findDiaryByDate: jest.fn(),
    updateDiary: jest.fn(),
    deleteDiary: jest.fn(),
  };

  // DB 반환 형태 (Date 객체)
  const MOCK_DIARY_RECORD = {
    date: new Date('2024-05-15T00:00:00.000Z'),
    peakDb: 88.5,
    emoji: '🔥',
    comment: '오늘은 잘됐다!',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_SECRET }),
      ],
      controllers: [DiaryController],
      providers: [
        DiaryService,
        JwtStrategy,
        { provide: DiaryRepository, useValue: mockDiaryRepo },
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
  describe('POST /diary', () => {
    const VALID_BODY = {
      peakDb: 88.5,
      emoji: '🔥',
      date: '2024-05-15',
      comment: '좋았다',
    };

    it('201 - 다이어리 생성 성공', async () => {
      mockDiaryRepo.upsertDiary.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe(DiaryResponseMessage.DIARY_CREATE_SUCCESS);
      expect(res.body.data.success).toBe(true);
      expect(mockDiaryRepo.upsertDiary).toHaveBeenCalledWith(
        1, 88.5, '🔥', '좋았다', '2024-05-15',
      );
    });

    it('201 - comment 없이 생성 (optional)', async () => {
      mockDiaryRepo.upsertDiary.mockResolvedValue(undefined);
      const { comment: _, ...bodyWithoutComment } = VALID_BODY;

      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bodyWithoutComment);

      expect(res.status).toBe(201);
    });

    it('400 - 날짜 형식 오류 (슬래시 구분)', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...VALID_BODY, date: '2024/05/15' });
      expect(res.status).toBe(400);
    });

    it('400 - 날짜 형식 오류 (6자리)', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...VALID_BODY, date: '240515' });
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 없음', async () => {
      const { peakDb: _, ...body } = VALID_BODY;
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 음수', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...VALID_BODY, peakDb: -1 });
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 200 초과', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...VALID_BODY, peakDb: 201 });
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 문자열', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...VALID_BODY, peakDb: 'loud' });
      expect(res.status).toBe(400);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/diary')
        .send(VALID_BODY);
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /diary (월별 조회)', () => {
    it('200 - 기록 있는 달 조회', async () => {
      mockDiaryRepo.findMonthlyDiary.mockResolvedValue([MOCK_DIARY_RECORD]);

      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024', month: '5' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(DiaryResponseMessage.DIARY_MONTHLY_SUCCESS);
      expect(res.body.data.entries).toHaveLength(1);
      expect(res.body.data.entries[0]).toMatchObject({
        date: '2024-05-15',
        peakDb: 88.5,
        emoji: '🔥',
      });
    });

    it('200 - 기록 없는 달 (빈 배열)', async () => {
      mockDiaryRepo.findMonthlyDiary.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024', month: '1' });

      expect(res.status).toBe(200);
      expect(res.body.data.entries).toHaveLength(0);
    });

    it('400 - year 없음', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ month: '5' });
      expect(res.status).toBe(400);
    });

    it('400 - month 없음', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024' });
      expect(res.status).toBe(400);
    });

    it('400 - month 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024', month: '0' });
      expect(res.status).toBe(400);
    });

    it('400 - month 13', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024', month: '13' });
      expect(res.status).toBe(400);
    });

    it('400 - month 문자열', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ year: '2024', month: 'may' });
      expect(res.status).toBe(400);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary')
        .query({ year: '2024', month: '5' });
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /diary/:date (날짜별 조회)', () => {
    it('200 - 정상 조회', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(MOCK_DIARY_RECORD);

      const res = await request(app.getHttpServer())
        .get('/diary/2024-05-15')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(DiaryResponseMessage.DIARY_DATE_SUCCESS);
      expect(res.body.data).toMatchObject({
        date: '2024-05-15',
        peakDb: 88.5,
        emoji: '🔥',
      });
    });

    it('400 - 날짜 형식 오류 (YYYYMMDD)', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary/20240515')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    it('400 - 날짜 형식 오류 (문자열)', async () => {
      const res = await request(app.getHttpServer())
        .get('/diary/today')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    it('404 - 해당 날짜 기록 없음', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/diary/2024-01-01')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(DiaryExceptionMessage.DIARY_NOT_FOUND);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).get('/diary/2024-05-15');
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('PATCH /diary/:date', () => {
    const VALID_BODY = { emoji: '💪', comment: '수정된 내용' };

    it('200 - 다이어리 수정 성공', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(MOCK_DIARY_RECORD);
      mockDiaryRepo.updateDiary.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .patch('/diary/2024-05-15')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(DiaryResponseMessage.DIARY_UPDATE_SUCCESS);
      expect(res.body.data.success).toBe(true);
    });

    it('400 - 날짜 형식 오류', async () => {
      const res = await request(app.getHttpServer())
        .patch('/diary/2024_05_15')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(VALID_BODY);
      expect(res.status).toBe(400);
    });

    it('404 - 해당 날짜 기록 없음', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .patch('/diary/2024-01-01')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(VALID_BODY);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(DiaryExceptionMessage.DIARY_NOT_FOUND);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .patch('/diary/2024-05-15')
        .send(VALID_BODY);
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('DELETE /diary/:date', () => {
    it('200 - 다이어리 삭제 성공', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(MOCK_DIARY_RECORD);
      mockDiaryRepo.deleteDiary.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/diary/2024-05-15')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(DiaryResponseMessage.DIARY_DELETE_SUCCESS);
      expect(res.body.data.success).toBe(true);
    });

    it('400 - 날짜 형식 오류', async () => {
      const res = await request(app.getHttpServer())
        .delete('/diary/invalid-date')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    it('404 - 해당 날짜 기록 없음', async () => {
      mockDiaryRepo.findDiaryByDate.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .delete('/diary/2024-01-01')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe(DiaryExceptionMessage.DIARY_NOT_FOUND);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).delete('/diary/2024-05-15');
      expect(res.status).toBe(401);
    });
  });
});
