import * as crypto from 'crypto';
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

interface PendingState {
  redirectUri: string;
  expiresAt: number;
}

interface PendingAuthCode {
  result: OAuthLoginResponse;
  expiresAt: number;
}

const ALLOWED_REDIRECT_SCHEMES = ['deciduelapp://', 'exp://'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly pendingStates = new Map<string, PendingState>();
  private readonly pendingAuthCodes = new Map<string, PendingAuthCode>();

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── 서버사이드 Kakao OAuth ──────────────────────────────────────

  kakaoInitUrl(redirectUri: string): string {
    const state = this.createOAuthState(redirectUri);
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('KAKAO_CLIENT_ID')!,
      redirect_uri: this.configService.get<string>('KAKAO_REDIRECT_URI')!,
      response_type: 'code',
      state,
    });
    return `https://kauth.kakao.com/oauth/authorize?${params}`;
  }

  async kakaoCallback(code: string, state: string): Promise<string> {
    const { redirectUri, errorUrl } = this.consumeOAuthState(state);
    if (errorUrl) return errorUrl;
    const sep = redirectUri!.includes('?') ? '&' : '?';

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.configService.get<string>('KAKAO_CLIENT_ID')!,
        redirect_uri: this.configService.get<string>('KAKAO_REDIRECT_URI')!,
        code,
      });
      const clientSecret = this.configService.get<string>('KAKAO_CLIENT_SECRET');
      if (clientSecret) body.set('client_secret', clientSecret);

      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: body.toString(),
      });
      if (!tokenRes.ok) throw new Error(`Kakao token exchange ${tokenRes.status}`);

      const { access_token } = (await tokenRes.json()) as { access_token: string };
      const providerId = await this.verifyKakaoToken(access_token);
      return this.buildAuthCodeRedirect('kakao', providerId, redirectUri!, sep);
    } catch (err) {
      this.logger.error('Kakao 콜백 처리 실패', err);
      return `${redirectUri}${sep}error=oauth_failed`;
    }
  }

  // ─── 서버사이드 Google OAuth ─────────────────────────────────────

  googleInitUrl(redirectUri: string): string {
    const state = this.createOAuthState(redirectUri);
    const params = new URLSearchParams({
      client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
      redirect_uri: this.configService.get<string>('GOOGLE_REDIRECT_URI')!,
      response_type: 'code',
      scope: 'openid',
      state,
      access_type: 'online',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async googleCallback(code: string, state: string): Promise<string> {
    const { redirectUri, errorUrl } = this.consumeOAuthState(state);
    if (errorUrl) return errorUrl;
    const sep = redirectUri!.includes('?') ? '&' : '?';

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.configService.get<string>('GOOGLE_CLIENT_ID')!,
          client_secret: this.configService.get<string>('GOOGLE_CLIENT_SECRET')!,
          redirect_uri: this.configService.get<string>('GOOGLE_REDIRECT_URI')!,
          code,
        }).toString(),
      });
      if (!tokenRes.ok) throw new Error(`Google token exchange ${tokenRes.status}`);

      const { id_token } = (await tokenRes.json()) as { id_token: string };
      const providerId = await this.verifyGoogleToken(id_token);
      return this.buildAuthCodeRedirect('google', providerId, redirectUri!, sep);
    } catch (err) {
      this.logger.error('Google 콜백 처리 실패', err);
      return `${redirectUri}${sep}error=oauth_failed`;
    }
  }

  // ─── auth code 교환 ──────────────────────────────────────────────

  exchangeAuthCode(code: string): OAuthLoginResponse {
    const entry = this.pendingAuthCodes.get(code);
    if (!entry || Date.now() > entry.expiresAt) {
      this.pendingAuthCodes.delete(code);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
    this.pendingAuthCodes.delete(code);
    return entry.result;
  }

  // ─── 기존 앱사이드 OAuth (Apple 용도 유지) ───────────────────────

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

  private createOAuthState(redirectUri: string): string {
    if (!ALLOWED_REDIRECT_SCHEMES.some((s) => redirectUri.startsWith(s))) {
      throw new BadRequestException('허용되지 않은 redirect URI입니다.');
    }
    const state = crypto.randomUUID();
    this.pendingStates.set(state, { redirectUri, expiresAt: Date.now() + 5 * 60_000 });
    return state;
  }

  private consumeOAuthState(state: string): { redirectUri?: string; errorUrl?: string } {
    const entry = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!entry || Date.now() > entry.expiresAt) {
      return { errorUrl: 'deciduelapp://oauth/callback?error=invalid_state' };
    }
    return { redirectUri: entry.redirectUri };
  }

  private async buildAuthCodeRedirect(
    provider: OAuthProvider,
    providerId: string,
    redirectUri: string,
    sep: string,
  ): Promise<string> {
    const result = await this.processOAuthUser(provider, providerId);
    const authCode = crypto.randomUUID();
    this.pendingAuthCodes.set(authCode, { result, expiresAt: Date.now() + 60_000 });
    return `${redirectUri}${sep}code=${authCode}`;
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
        return this.verifyAppleToken(idToken!);
      case 'google':
        return this.verifyGoogleToken(idToken!);
      case 'kakao':
        return this.verifyKakaoToken(accessToken!);
      default:
        throw new BadRequestException(AuthExceptionMessage.OAUTH_UNSUPPORTED_PROVIDER);
    }
  }

  private async verifyAppleToken(idToken: string): Promise<string> {
    try {
      const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: 'https://appleid.apple.com',
      });
      if (!payload.sub) throw new Error('sub missing');
      return payload.sub;
    } catch (err) {
      this.logger.error('Apple 토큰 검증 실패', err);
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
      return payload.sub;
    } catch (err) {
      this.logger.error('Google 토큰 검증 실패', err);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
  }

  private async verifyKakaoToken(accessToken: string): Promise<string> {
    try {
      const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Kakao API ${res.status}`);
      const data = (await res.json()) as { id: number };
      if (!data.id) throw new Error('id missing');
      return String(data.id);
    } catch (err) {
      this.logger.error('Kakao 토큰 검증 실패', err);
      throw new UnauthorizedException(AuthExceptionMessage.OAUTH_INVALID_TOKEN);
    }
  }
}
