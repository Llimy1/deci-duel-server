import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SoloRecordController } from './solo-record.controller';
import { SoloRecordService } from './solo-record.service';
import { SoloRecordRepository } from './solo-record.repository';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { AllExceptionsFilter, HttpExceptionFilter } from '../../common/filter/http-exception.filter';
import { SoloRecordResponseMessage } from '../../common/enum/reponse-message.enum';

const TEST_SECRET = 'test-jwt-secret';

describe('SoloRecordController (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  const mockSoloRecordRepo = {
    upsertSoloRecord: jest.fn(),
    findSoloRecordByUserId: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: TEST_SECRET }),
      ],
      controllers: [SoloRecordController],
      providers: [
        SoloRecordService,
        JwtStrategy,
        { provide: SoloRecordRepository, useValue: mockSoloRecordRepo },
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
  describe('POST /solo/record', () => {
    it('201 - 솔로 기록 저장 성공', async () => {
      mockSoloRecordRepo.upsertSoloRecord.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 95.5 });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe(SoloRecordResponseMessage.SOLO_RECORD_CREATE_SUCCESS);
      expect(res.body.data.success).toBe(true);
      expect(mockSoloRecordRepo.upsertSoloRecord).toHaveBeenCalledWith(1, 95.5);
    });

    it('201 - 최솟값 (0 dB)', async () => {
      mockSoloRecordRepo.upsertSoloRecord.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 0 });

      expect(res.status).toBe(201);
    });

    it('201 - 최댓값 (200 dB)', async () => {
      mockSoloRecordRepo.upsertSoloRecord.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 200 });

      expect(res.status).toBe(201);
    });

    it('400 - peakDb 필드 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 음수', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: -1 });
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 200 초과', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 201 });
      expect(res.status).toBe(400);
    });

    it('400 - peakDb 문자열', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 'loud' });
      expect(res.status).toBe(400);
    });

    it('400 - 알 수 없는 필드 포함 (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ peakDb: 95.5, unknownField: 'hack' });
      expect(res.status).toBe(400);
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer())
        .post('/solo/record')
        .send({ peakDb: 95.5 });
      expect(res.status).toBe(401);
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('GET /solo/record', () => {
    it('200 - 기록 있는 유저 조회', async () => {
      mockSoloRecordRepo.findSoloRecordByUserId.mockResolvedValue({
        peakDb: 95.5,
        bestDb: 98.0,
      });

      const res = await request(app.getHttpServer())
        .get('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(SoloRecordResponseMessage.FIND_SOLO_RECORD_DATA_SUCCESS);
      expect(res.body.data).toMatchObject({ peakDb: 95.5, bestDb: 98.0 });
    });

    it('200 - 기록 없는 유저 (0으로 반환)', async () => {
      mockSoloRecordRepo.findSoloRecordByUserId.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get('/solo/record')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ peakDb: 0, bestDb: 0 });
    });

    it('401 - 토큰 없음', async () => {
      const res = await request(app.getHttpServer()).get('/solo/record');
      expect(res.status).toBe(401);
    });
  });
});
