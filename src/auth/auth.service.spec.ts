jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { jwtVerify } from 'jose';
import { AuthService } from './auth.service';
import { UserRepository } from '../user/user.repository';
import {
  BadRequestException,
  UnauthorizedException,
} from '../common/exception/custom.exception';
import { AuthExceptionMessage } from '../common/exception/exception.message';
import { OperationalEventService } from '../common/operational-event/operational-event.service';

describe('AuthService — 네이티브 OAuth 토큰 검증', () => {
  let service: AuthService;

  const mockUserRepo = {
    findByProvider: jest.fn(),
    createOAuthUser: jest.fn(),
    updateRefreshToken: jest.fn(),
    findUserByUserId: jest.fn(),
  };
  const mockJwtService = { sign: jest.fn(), verify: jest.fn() };

  const configMap: Record<string, string | undefined> = {};
  const mockConfigService = { get: jest.fn((key: string) => configMap[key]) };

  const mockOperationalEvents = { record: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(configMap).forEach((k) => delete configMap[k]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: OperationalEventService, useValue: mockOperationalEvents },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  /* ────────────────────────────────────────────────────────── */
  describe('verifyOAuthToken — provider별 필수 토큰 누락', () => {
    it('apple: idToken 없으면 400', async () => {
      await expect(
        (service as any).verifyOAuthToken('apple', undefined, undefined),
      ).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_TOKEN_REQUIRED,
        constructor: BadRequestException,
      });
    });

    it('google: idToken 없으면 400', async () => {
      await expect(
        (service as any).verifyOAuthToken('google', undefined, undefined),
      ).rejects.toMatchObject({ message: AuthExceptionMessage.OAUTH_TOKEN_REQUIRED });
    });

    it('kakao: accessToken 없으면 400', async () => {
      await expect(
        (service as any).verifyOAuthToken('kakao', undefined, undefined),
      ).rejects.toMatchObject({ message: AuthExceptionMessage.OAUTH_TOKEN_REQUIRED });
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('verifyAppleToken — audience 검증', () => {
    it('aud가 허용 목록에 없으면 401 (audience mismatch)', async () => {
      configMap.APPLE_ALLOWED_AUDIENCES = 'com.deciduel.app';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'apple-user-1', aud: 'com.other.app' },
      });

      await expect((service as any).verifyAppleToken('id_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });
    });

    it('aud가 허용 목록에 있으면 providerId 반환', async () => {
      configMap.APPLE_ALLOWED_AUDIENCES = 'com.deciduel.app';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'apple-user-1', aud: 'com.deciduel.app' },
      });

      await expect((service as any).verifyAppleToken('id_token')).resolves.toBe('apple-user-1');
    });

    it('env 미설정 시 audience 검증을 스킵하고 통과', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'apple-user-1', aud: 'anything' },
      });

      await expect((service as any).verifyAppleToken('id_token')).resolves.toBe('apple-user-1');
    });

    it('OAUTH_AUDIENCE_REQUIRED=true인데 allowlist가 없으면 401', async () => {
      configMap.OAUTH_AUDIENCE_REQUIRED = 'true';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'apple-user-1', aud: 'com.deciduel.app' },
      });

      await expect((service as any).verifyAppleToken('id_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('verifyGoogleToken — audience 검증', () => {
    it('aud가 허용 목록에 없으면 401 (audience mismatch)', async () => {
      configMap.GOOGLE_ALLOWED_CLIENT_IDS = 'web-client-id,ios-client-id,android-client-id';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'google-user-1', aud: 'unknown-client-id' },
      });

      await expect((service as any).verifyGoogleToken('id_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });
    });

    it('aud가 허용 목록(iOS client id)에 있으면 providerId 반환', async () => {
      configMap.GOOGLE_ALLOWED_CLIENT_IDS = 'web-client-id,ios-client-id,android-client-id';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'google-user-1', aud: 'ios-client-id' },
      });

      await expect((service as any).verifyGoogleToken('id_token')).resolves.toBe('google-user-1');
    });

    it('production인데 allowlist가 없으면 401', async () => {
      configMap.NODE_ENV = 'production';
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: { sub: 'google-user-1', aud: 'web-client-id' },
      });

      await expect((service as any).verifyGoogleToken('id_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });
    });
  });

  /* ────────────────────────────────────────────────────────── */
  describe('verifyKakaoToken — 검증 실패 케이스', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('Kakao API 응답 실패(non-2xx) → 401', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as any;

      await expect((service as any).verifyKakaoToken('bad_access_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });
    });

    it('KAKAO_APP_ID가 필요한 환경인데 env가 없으면 401', async () => {
      configMap.OAUTH_AUDIENCE_REQUIRED = 'true';

      await expect((service as any).verifyKakaoToken('access_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });

      expect(global.fetch).toBe(originalFetch);
    });

    it('access_token_info의 app_id가 KAKAO_APP_ID와 다르면 401', async () => {
      configMap.KAKAO_APP_ID = '12345';
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ app_id: 99999 }),
      }) as any;

      await expect((service as any).verifyKakaoToken('access_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
        constructor: UnauthorizedException,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://kapi.kakao.com/v1/user/access_token_info',
        expect.objectContaining({
          headers: { Authorization: 'Bearer access_token' },
        }),
      );
    });

    it('네트워크 오류 → 401', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

      await expect((service as any).verifyKakaoToken('access_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
      });
    });

    it('응답 schema 이상(id 누락) → 401', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

      await expect((service as any).verifyKakaoToken('access_token')).rejects.toMatchObject({
        message: AuthExceptionMessage.OAUTH_INVALID_TOKEN,
      });
    });

    it('정상 응답이면 id를 문자열로 반환', async () => {
      configMap.KAKAO_APP_ID = '12345';
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ app_id: 12345 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 12345 }) }) as any;

      await expect((service as any).verifyKakaoToken('access_token')).resolves.toBe('12345');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
