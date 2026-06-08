import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { resolveAdminJwtSecret } from '../admin-jwt-secret';
import type { AdminJwtPayload } from '../types/admin-jwt-payload';

/**
 * 일반 유저 JWT(JwtStrategy, name='jwt')와 완전히 분리된 admin 전용 strategy.
 * - 별도 secret(`ADMIN_JWT_SECRET`) 사용 — fail-closed 검증은 `resolveAdminJwtSecret()` 참고.
 *   시크릿이 없거나/플레이스홀더이거나/JWT_SECRET과 같으면 strategy 생성(=모듈 초기화) 시점에
 *   즉시 throw해 서버 기동을 막는다 — admin 인증이 알려진 기본값으로 "성공"하는 일은 없어야 한다.
 * - payload.type !== 'admin'이면 거부 (일반 유저 토큰으로 admin API 접근 차단)
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: resolveAdminJwtSecret(config),
    });
  }

  validate(payload: AdminJwtPayload) {
    if (payload?.type !== 'admin' || payload?.role !== 'owner') {
      throw new UnauthorizedException('관리자 토큰이 아닙니다.');
    }
    return { role: payload.role };
  }
}
