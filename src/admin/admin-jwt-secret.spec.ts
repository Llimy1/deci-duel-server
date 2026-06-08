import { ConfigService } from '@nestjs/config';
import { resolveAdminJwtSecret } from './admin-jwt-secret';

function makeConfig(map: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => map[key] } as unknown as ConfigService;
}

describe('resolveAdminJwtSecret — fail-closed 검증', () => {
  it('ADMIN_JWT_SECRET이 없으면 throw한다 (알려진 기본값으로 fallback 금지)', () => {
    const config = makeConfig({ JWT_SECRET: 'user-secret-aaaa' });
    expect(() => resolveAdminJwtSecret(config)).toThrow(/ADMIN_JWT_SECRET/);
  });

  it('ADMIN_JWT_SECRET이 빈 문자열/공백이면 throw한다', () => {
    expect(() =>
      resolveAdminJwtSecret(makeConfig({ ADMIN_JWT_SECRET: '', JWT_SECRET: 'user-secret-aaaa' })),
    ).toThrow(/ADMIN_JWT_SECRET/);
    expect(() =>
      resolveAdminJwtSecret(
        makeConfig({ ADMIN_JWT_SECRET: '   ', JWT_SECRET: 'user-secret-aaaa' }),
      ),
    ).toThrow(/ADMIN_JWT_SECRET/);
  });

  it('ADMIN_JWT_SECRET이 플레이스홀더 값("change-me-admin-secret")이면 throw한다', () => {
    const config = makeConfig({
      ADMIN_JWT_SECRET: 'change-me-admin-secret',
      JWT_SECRET: 'user-secret-aaaa',
    });
    expect(() => resolveAdminJwtSecret(config)).toThrow(/플레이스홀더/);
  });

  it('ADMIN_JWT_SECRET이 JWT_SECRET과 동일하면 throw한다', () => {
    const config = makeConfig({
      ADMIN_JWT_SECRET: 'shared-secret-value',
      JWT_SECRET: 'shared-secret-value',
    });
    expect(() => resolveAdminJwtSecret(config)).toThrow(/JWT_SECRET/);
  });

  it('ADMIN_JWT_SECRET이 충분하고 고유하면 그대로 반환한다', () => {
    const config = makeConfig({
      ADMIN_JWT_SECRET: 'admin-only-secret-value',
      JWT_SECRET: 'user-only-secret-value',
    });
    expect(resolveAdminJwtSecret(config)).toBe('admin-only-secret-value');
  });

  it('JWT_SECRET이 설정되지 않은 경우에도 ADMIN_JWT_SECRET이 유효하면 통과한다', () => {
    const config = makeConfig({ ADMIN_JWT_SECRET: 'admin-only-secret-value' });
    expect(resolveAdminJwtSecret(config)).toBe('admin-only-secret-value');
  });
});
