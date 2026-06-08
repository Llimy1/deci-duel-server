import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { OperationalEventService } from './operational-event.service';
import { PrismaService } from '../../prisma/prisma.service';
import { requestContextStorage } from '../context/request-context';

describe('OperationalEventService', () => {
  let service: OperationalEventService;

  const mockPrisma = {
    operationalEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OperationalEventService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = moduleRef.get(OperationalEventService);
  });

  describe('record — 저장 성공', () => {
    it('필수 필드를 채워 prisma.operationalEvent.create를 호출한다', async () => {
      mockPrisma.operationalEvent.create.mockResolvedValue({ id: 1 });

      await service.record({
        level: 'info',
        category: 'admin',
        event: 'admin_login_success',
        message: '관리자 로그인 성공',
        metadata: { ip: '127.0.0.1' },
      });

      expect(mockPrisma.operationalEvent.create).toHaveBeenCalledTimes(1);
      const arg = mockPrisma.operationalEvent.create.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        level: 'info',
        category: 'admin',
        event: 'admin_login_success',
        message: '관리자 로그인 성공',
      });
      expect(arg.data.metadata).toEqual({ ip: '127.0.0.1' });
    });

    it('요청 컨텍스트(AsyncLocalStorage)의 requestId를 자동으로 채운다', async () => {
      mockPrisma.operationalEvent.create.mockResolvedValue({ id: 2 });

      await requestContextStorage.run({ requestId: 'req_ctx_123' }, async () => {
        await service.record({
          level: 'warn',
          category: 'http',
          event: 'something_happened',
        });
      });

      const arg = mockPrisma.operationalEvent.create.mock.calls[0][0];
      expect(arg.data.requestId).toBe('req_ctx_123');
    });

    it('명시적으로 전달된 requestId가 컨텍스트보다 우선한다', async () => {
      mockPrisma.operationalEvent.create.mockResolvedValue({ id: 3 });

      await requestContextStorage.run({ requestId: 'req_ctx_999' }, async () => {
        await service.record({
          level: 'info',
          category: 'system',
          event: 'explicit_request_id',
          requestId: 'req_explicit',
        });
      });

      const arg = mockPrisma.operationalEvent.create.mock.calls[0][0];
      expect(arg.data.requestId).toBe('req_explicit');
    });

    it('metadata가 없으면 Prisma.JsonNull을 전달한다', async () => {
      mockPrisma.operationalEvent.create.mockResolvedValue({ id: 4 });

      await service.record({ level: 'info', category: 'system', event: 'no_metadata' });

      const arg = mockPrisma.operationalEvent.create.mock.calls[0][0];
      expect(arg.data.metadata).toBe(Prisma.JsonNull);
    });

    it('metadata 내 token/secret/password 류 키를 저장 전 [REDACTED]로 치환한다', async () => {
      mockPrisma.operationalEvent.create.mockResolvedValue({ id: 5 });

      await service.record({
        level: 'warn',
        category: 'auth',
        event: 'oauth_token_verification_failed',
        metadata: {
          provider: 'kakao',
          accessToken: 'should-never-be-stored',
          nested: { refreshToken: 'nested-secret', reason: 'expired' },
        },
      });

      const arg = mockPrisma.operationalEvent.create.mock.calls[0][0];
      expect(arg.data.metadata).toEqual({
        provider: 'kakao',
        accessToken: '[REDACTED]',
        nested: { refreshToken: '[REDACTED]', reason: 'expired' },
      });
    });
  });

  describe('record — 저장 실패 시 원 요청에 영향 없음 (resilience)', () => {
    it('prisma.create가 실패해도 throw하지 않는다', async () => {
      mockPrisma.operationalEvent.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.record({ level: 'error', category: 'system', event: 'db_down' }),
      ).resolves.toBeUndefined();
    });

    it('저장 실패 시에도 Promise<void>를 반환하며 호출자의 흐름을 막지 않는다', async () => {
      mockPrisma.operationalEvent.create.mockRejectedValue(new Error('boom'));

      const before = Date.now();
      await service.record({ level: 'error', category: 'system', event: 'boom' });
      const after = Date.now();

      // 예외가 전파되지 않고 정상적으로 resolve됨
      expect(after - before).toBeLessThan(5000);
    });
  });

  describe('findMany — 커서 페이지네이션', () => {
    it('limit+1개를 조회해 hasMore/nextCursor를 계산한다', async () => {
      const rows = Array.from({ length: 4 }, (_, i) => ({ id: 100 - i }));
      mockPrisma.operationalEvent.findMany.mockResolvedValue(rows);

      const result = await service.findMany({ limit: 3 });

      expect(mockPrisma.operationalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 4 }),
      );
      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(rows[2].id);
    });

    it('결과가 limit 이하이면 hasMore=false, nextCursor=null', async () => {
      const rows = [{ id: 10 }, { id: 9 }];
      mockPrisma.operationalEvent.findMany.mockResolvedValue(rows);

      const result = await service.findMany({ limit: 5 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('cursor가 주어지면 prisma cursor/skip 옵션을 전달한다', async () => {
      mockPrisma.operationalEvent.findMany.mockResolvedValue([]);

      await service.findMany({ limit: 10, cursor: 42 });

      expect(mockPrisma.operationalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 42 }, skip: 1 }),
      );
    });

    it('limit이 범위를 벗어나면 clamp한다 (최대 200)', async () => {
      mockPrisma.operationalEvent.findMany.mockResolvedValue([]);

      await service.findMany({ limit: 9999 });

      expect(mockPrisma.operationalEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 201 }),
      );
    });
  });
});
