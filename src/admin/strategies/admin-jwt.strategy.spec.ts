import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminJwtStrategy } from './admin-jwt.strategy';

describe('AdminJwtStrategy — admin/user 토큰 판별', () => {
  let strategy: AdminJwtStrategy;

  beforeEach(() => {
    const configMap: Record<string, string | undefined> = { ADMIN_JWT_SECRET: 'admin-secret' };
    const config = { get: (key: string) => configMap[key] } as unknown as ConfigService;
    strategy = new AdminJwtStrategy(config);
  });

  it('payload.type === "admin" && role === "owner"이면 통과한다', () => {
    expect(strategy.validate({ type: 'admin', role: 'owner' })).toEqual({ role: 'owner' });
  });

  it('일반 유저 토큰 형태(payload.type 없음)는 거부한다', () => {
    expect(() => strategy.validate({ sub: 1, nickname: 'tester' } as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('type이 admin이 아니면 거부한다', () => {
    expect(() => strategy.validate({ type: 'user', role: 'owner' } as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('role이 owner가 아니면 거부한다', () => {
    expect(() => strategy.validate({ type: 'admin', role: 'guest' } as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('payload가 비어있으면 거부한다', () => {
    expect(() => strategy.validate({} as any)).toThrow(UnauthorizedException);
    expect(() => strategy.validate(null as any)).toThrow(UnauthorizedException);
  });
});
