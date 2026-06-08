import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UserRepository } from '../user/user.repository';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '../common/exception/custom.exception';
import { AuthExceptionMessage } from '../common/exception/exception.message';
import type { OAuthProvider } from './dto/request/auth.request';
import {
  OAuthExistingUserResponse,
  OAuthLoginResponse,
  OAuthNewUserResponse,
  OAuthSignupResponse,
  RefreshResponse,
} from './dto/response/auth.response';
import { RefreshRequest } from './dto/request/auth.request';
import { OperationalEventService } from '../common/operational-event/operational-event.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly operationalEvents: OperationalEventService,
  ) {}

  // ─── 네이티브 SDK 기반 OAuth (Apple/Google/Kakao 공통) ───────────

  async oauthLogin(
    provider: OAuthProvider,
    idToken?: string,
    accessToken?: string,
  ): Promise<OAuthLoginResponse> {
    const providerId = await this.verifyOAuthToken(provider, idToken, accessToken);
    return this.processOAuthUser(provider, providerId);
  }

  async completeOAuthSignup(
    signupToken: string,
    nickname: string,
    termsVersion: string,
    privacyVersion: string,
  ): Promise<OAuthSignupResponse> {
    const { provider, providerId } = this.verifySignupToken(signupToken);

    const existing = await this.userRepository.findByProvider(provider, providerId);
    if (existing) throw new ConflictException(AuthExceptionMessage.DUPLICATE_ID);

    const user = await this.userRepository.createOAuthUser(
      provider,
      providerId,
      nickname,
      termsVersion,
      privacyVersion,
    );

    const tokens = this.generateTokens(user.id, user.nickname);
    await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);

    return new OAuthSignupResponse(tokens.accessToken, tokens.refreshToken, {
      id: user.id,
      nickname: user.nickname,
    });
  }

  async refresh(dto: RefreshRequest): Promise<RefreshResponse> {
    let payload: { sub: number; nickname: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken);
    } catch {
      throw new UnauthorizedException(AuthExceptionMessage.INVALID_TOKEN);
    }

    const user = await this.userRepository.findUserByUserId(payload.sub);
    if (!user || user.refreshToken !== dto.refreshToken)
      throw new UnauthorizedException(AuthExceptionMessage.INVALID_TOKEN);

    const tokens = this.generateTokens(user.id, user.nickname);
    await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);

    return new RefreshResponse(tokens.accessToken, tokens.refreshToken, {
      id: user.id,
      nickname: user.nickname,
    });
  }

  async logout(userId: number): Promise<void> {
    await this.userRepository.updateRefreshToken(userId, null);
  }

  // ─── 내부 헬퍼 ──────────────────────────────────────────────────

  generateTokens(userId: number, nickname: string) {
    const accessToken = this.jwtService.sign({ sub: userId, nickname }, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign({ sub: userId }, { expiresIn: '30d' });
    return { accessToken, refreshToken };
  }

  private async processOAuthUser(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<OAuthLoginResponse> {
    const user = await this.userRepository.findByProvider(provider, providerId);
    if (user) {
      const tokens = this.generateTokens(user.id, user.nickname);
      await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);
      return new OAuthExistingUserResponse(tokens.accessToken, tokens.refreshToken, {
        id: user.id,
        nickname: user.nickname,
      });
    }
    const signupToken = this.generateSignupToken(provider, providerId);
    return new OAuthNewUserResponse(signupToken, provider);
  }

  private generateSignupToken(provider: OAuthProvider, providerId: string): string {
    return this.jwtService.sign(
      { sub: 'oauth_signup', provider, providerId },
      { expiresIn: '15m' },
    );
  }

  private verifySignupToken(signupToken: string): { provider: OAuthProvider; providerId: string } {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        provider: OAuthProvider;
        providerId: string;
      }>(signupToken);
      if (payload.sub !== 'oauth_signup') throw new Error();
      return { provider: payload.provider, providerId: payload.providerId };
    } catch {
      throw new UnauthorizedException(AuthExceptionMessage.SIGNUP_TOKEN_INVALID);
    }
  }

  private async verifyOAuthToken(
    provider: OAuthProvider,
    idToken?: string,
    accessToken?: string,
  ): Promise<string> {
    switch (provider) {
      case 'apple':
        if (!idToken) throw new BadRequestException(AuthExceptionMessage.OAUTH_TOKEN_REQUIRED);
        return this.verifyAppleToken(idToken);
      case 'google':
        if (!idToken) throw new BadRequestException(AuthExceptionMessage.OAUTH_TOKEN_REQUIRED);
        return this.verifyGoogleToken(idToken);
      case 'kakao':
        if (!accessToken) throw new BadRequestException(AuthExceptionMessage.OAUTH_TOKEN_REQUIRED);
        return this.verifyKakaoToken(accessToken);
      default:
        throw new BadRequestException(AuthExceptionMessage.OAUTH_UNSUPPORTED_PROVIDER);
    }
  }

  /** ',' 구분 env 문자열 → trim된 비어있지 않은 문자열 배열 */
  private parseAllowedAudiences(envKey: string): string[] {
    const raw = this.configService.get<string>(envKey);
    if (!raw) return [];
    return raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private isAudienceRequired(): boolean {
    return (
      this.configService.get<string>('OAUTH_AUDIENCE_REQUIRED') === 'true' ||
      this.configService.get<string>('NODE_ENV') === 'production'
    );
  }

  private assertAudienceAllowed(aud: unknown, allowed: string[], providerLabel: string): void {
    if (allowed.length === 0) {
      if (this.isAudienceRequired()) {
        this.logger.error(`${providerLabel} audience allowlist is missing`);
        throw new Error('audience allowlist missing');
      }
      return;
    }
    const audList = Array.isArray(aud) ? aud : [aud];
    const matched = audList.some((a) => typeof a === 'string' && allowed.includes(a));
    if (!matched) {
      this.logger.warn(`${providerLabel} audience mismatch: aud=${JSON.stringify(aud)}`);
      throw new Error('audience mismatch');
    }
  }

  private async verifyAppleToken(idToken: string): Promise<string> {
    try {
      const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: 'https://appleid.apple.com',
      });
      if (!payload.sub) throw new Error('sub missing');
      this.assertAudienceAllowed(
        payload.aud,
        this.parseAllowedAudiences('APPLE_ALLOWED_AUDIENCES'),
        'Apple',
      );
      return payload.sub;
    } catch (err) {
      this.logger.error('Apple 토큰 검증 실패', err);
      await this.recordOAuthVerificationFailure('apple', err);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
  }

  private async verifyGoogleToken(idToken: string): Promise<string> {
    try {
      const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: ['accounts.google.com', 'https://accounts.google.com'],
      });
      if (!payload.sub) throw new Error('sub missing');
      this.assertAudienceAllowed(
        payload.aud,
        this.parseAllowedAudiences('GOOGLE_ALLOWED_CLIENT_IDS'),
        'Google',
      );
      return payload.sub;
    } catch (err) {
      this.logger.error('Google 토큰 검증 실패', err);
      await this.recordOAuthVerificationFailure('google', err);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
  }

  private async verifyKakaoToken(accessToken: string): Promise<string> {
    try {
      await this.assertKakaoAccessTokenIssuedForApp(accessToken);

      const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Kakao API ${res.status}`);
      const data = (await res.json()) as { id: number };
      if (!data.id) throw new Error('id missing');
      return String(data.id);
    } catch (err) {
      this.logger.error('Kakao 토큰 검증 실패', err);
      await this.recordOAuthVerificationFailure('kakao', err);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
  }

  private async assertKakaoAccessTokenIssuedForApp(accessToken: string): Promise<void> {
    const allowedAppId = this.configService.get<string>('KAKAO_APP_ID')?.trim();

    if (!allowedAppId) {
      if (this.isAudienceRequired()) {
        this.logger.error('Kakao app id allowlist is missing');
        throw new Error('kakao app id allowlist missing');
      }
      return;
    }

    const res = await fetch('https://kapi.kakao.com/v1/user/access_token_info', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Kakao access token info API ${res.status}`);

    const data = (await res.json()) as { app_id?: number | string };
    const tokenAppId = data.app_id === undefined ? undefined : String(data.app_id);
    if (tokenAppId !== allowedAppId) {
      this.logger.warn(`Kakao app id mismatch: app_id=${tokenAppId ?? 'missing'}`);
      throw new Error('kakao app id mismatch');
    }
  }

  /**
   * OAuth 토큰/audience 검증 실패를 운영 이벤트로 남긴다.
   * token/idToken/accessToken 원문은 절대 metadata에 포함하지 않고,
   * 실패 사유(reason)만 짧게 기록한다.
   */
  private async recordOAuthVerificationFailure(provider: OAuthProvider, err: unknown): Promise<void> {
    const reason = err instanceof Error ? err.message : String(err);
    await this.operationalEvents.record({
      level: 'warn',
      category: 'auth',
      event: 'oauth_token_verification_failed',
      message: `${provider} OAuth 토큰 검증 실패`,
      metadata: { provider, reason },
    });
  }
}
