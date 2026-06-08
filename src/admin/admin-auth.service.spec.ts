import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { OperationalEventService } from '../common/operational-event/operational-event.service';

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  const configMap: Record<string, string | undefined> = {};
  const mockConfig = { get: jest.fn((key: string) => configMap[key]) };
  const mockJwtService = { sign: jest.fn(() => 'signed.admin.jwt') };
  const mockEvents = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(configMap).forEach((k) => delete configMap[k]);
    configMap.ADMIN_ACCESS_CODE = 'super-secret-code';
    configMap.ADMIN_JWT_SECRET = 'admin-secret';
    configMap.ADMIN_TOKEN_EXPIRES_IN = '3600';

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwtService },
        { provide: OperationalEventService, useValue: mockEvents },
      ],
    }).compile();

    service = moduleRef.get(AdminAuthService);
  });

  describe('login — 성공', () => {
    it('올바른 코드면 admin JWT를 발급하고 성공 이벤트를 기록한다', async () => {
      const result = await service.login('super-secret-code', '1.2.3.4');

      expect(result.accessToken).toBe('signed.admin.jwt');
      expect(result.expiresIn).toBe(3600);
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        { type: 'admin', role: 'owner' },
        expect.objectContaining({ secret: 'admin-secret', expiresIn: 3600 }),
      );

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          category: 'admin',
          event: 'admin_login_success',
          metadata: { ip: '1.2.3.4' },
        }),
      );
    });
  });

  describe('login — 실패', () => {
    it('코드가 틀리면 401을 던지고 실패 이벤트를 기록한다 (코드 원문은 절대 남기지 않음)', async () => {
      await expect(service.login('wrong-code', '5.6.7.8')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          category: 'admin',
          event: 'admin_login_failed',
          metadata: { ip: '5.6.7.8' },
        }),
      );

      // metadata 어디에도 시도된 코드 원문이 들어가지 않아야 한다
      const recordedArgs = mockEvents.record.mock.calls.map((c) => JSON.stringify(c[0]));
      for (const arg of recordedArgs) {
        expect(arg).not.toContain('wrong-code');
        expect(arg).not.toContain('super-secret-code');
      }
    });

    it('ADMIN_ACCESS_CODE가 설정되지 않으면 어떤 코드도 통과하지 못한다', async () => {
      delete configMap.ADMIN_ACCESS_CODE;

      await expect(service.login('anything', '1.1.1.1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('빈 문자열 코드는 거부한다', async () => {
      await expect(service.login('', '1.1.1.1')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('login — rate limit', () => {
    it('실패가 임계치를 넘으면 429를 던지고 rate-limit 이벤트를 기록한다', async () => {
      const ip = '9.9.9.9';
      // 기본 임계치(5회) 초과시킴
      for (let i = 0; i < 5; i++) {
        await expect(service.login('wrong', ip)).rejects.toBeInstanceOf(UnauthorizedException);
      }

      mockEvents.record.mockClear();
      const err = await service.login('wrong', ip).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(mockEvents.record).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          category: 'admin',
          event: 'admin_login_rate_limited',
          metadata: { ip },
        }),
      );
    });

    it('로그인 성공 시 해당 IP의 실패 카운트가 초기화된다', async () => {
      const ip = '8.8.8.8';
      await expect(service.login('wrong', ip)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.login('wrong', ip)).rejects.toBeInstanceOf(UnauthorizedException);

      // 성공 → reset
      await expect(service.login('super-secret-code', ip)).resolves.toMatchObject({
        accessToken: 'signed.admin.jwt',
      });

      // 다시 실패해도 곧바로 차단되지 않아야 한다 (카운트가 리셋되었으므로)
      await expect(service.login('wrong', ip)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('resolveExpiresIn', () => {
    it('ADMIN_TOKEN_EXPIRES_IN이 없거나 유효하지 않으면 기본값(3600)을 사용한다', async () => {
      configMap.ADMIN_TOKEN_EXPIRES_IN = 'not-a-number';
      const result = await service.login('super-secret-code', '1.0.0.1');
      expect(result.expiresIn).toBe(3600);
    });
  });
});
