import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { OperationalEventService } from '../common/operational-event/operational-event.service';
import { AdminLoginRateLimiter } from './admin-login-rate-limiter';
import { resolveAdminJwtSecret } from './admin-jwt-secret';
import { AdminLoginResponse } from './dto/response/admin.response';
import type { AdminJwtPayload } from './types/admin-jwt-payload';

const DEFAULT_EXPIRES_IN_SECONDS = 3600;

/** 문자열 길이로 인한 타이밍 사이드채널을 줄이는 상수 시간 비교 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // 길이가 다르더라도 동일한 시간이 걸리도록 자기 자신과 비교한다
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AdminAuthService {
  private readonly rateLimiter = new AdminLoginRateLimiter();

  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly events: OperationalEventService,
  ) {}

  /**
   * 지정 코드(`ADMIN_ACCESS_CODE`) 검증 → admin JWT 발급.
   * 성공/실패/rate-limit 모두 OperationalEvent로 남긴다.
   * 코드 원문은 절대 로그/메타데이터에 남기지 않는다.
   */
  async login(code: string, ip: string | undefined): Promise<AdminLoginResponse> {
    const clientIp = ip ?? 'unknown';

    if (this.rateLimiter.isBlocked(clientIp)) {
      await this.events.record({
        level: 'warn',
        category: 'admin',
        event: 'admin_login_rate_limited',
        message: '관리자 로그인 시도 횟수 초과로 차단됨',
        metadata: { ip: clientIp },
      });
      throw new HttpException('잠시 후 다시 시도해주세요.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const expectedCode = this.config.get<string>('ADMIN_ACCESS_CODE');
    const isValid = !!expectedCode && code.length > 0 && safeCompare(code, expectedCode);

    if (!isValid) {
      this.rateLimiter.registerFailure(clientIp);
      await this.events.record({
        level: 'warn',
        category: 'admin',
        event: 'admin_login_failed',
        message: '관리자 로그인 실패 (코드 불일치)',
        metadata: { ip: clientIp },
      });
      throw new UnauthorizedException('관리자 코드가 올바르지 않습니다.');
    }

    this.rateLimiter.reset(clientIp);

    const expiresIn = this.resolveExpiresIn();
    const payload: AdminJwtPayload = { type: 'admin', role: 'owner' };
    const accessToken = this.jwtService.sign(payload, {
      // fail-closed: 시크릿이 없거나 플레이스홀더이거나 JWT_SECRET과 같으면 즉시 throw.
      // (AdminJwtStrategy 생성 시점에 이미 검증되어 정상적으로는 여기까지 오지 않지만,
      //  토큰 발급 경로에서도 동일 기준으로 이중 검증해 "조용한 안전하지 않은 기본값
      //  fallback"이 절대 발생하지 않도록 한다)
      secret: resolveAdminJwtSecret(this.config),
      expiresIn,
    });

    await this.events.record({
      level: 'info',
      category: 'admin',
      event: 'admin_login_success',
      message: '관리자 로그인 성공',
      metadata: { ip: clientIp },
    });

    return new AdminLoginResponse(accessToken, expiresIn);
  }

  private resolveExpiresIn(): number {
    const raw = this.config.get<string>('ADMIN_TOKEN_EXPIRES_IN');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRES_IN_SECONDS;
  }
}
