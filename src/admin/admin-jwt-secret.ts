import { ConfigService } from '@nestjs/config';

/**
 * 절대 실제 운영에서 사용되어선 안 되는 플레이스홀더 값.
 * 과거 코드에 `?? 'change-me-admin-secret'` 형태의 fallback이 있었는데,
 * 이는 환경변수 누락 시 "조용히" 알려진 기본값으로 admin 인증이 동작하게 만드는
 * 심각한 보안 결함이었다 (누구나 이 문자열로 admin JWT를 위조할 수 있음).
 */
const PLACEHOLDER_ADMIN_JWT_SECRET = 'change-me-admin-secret';

/**
 * `ADMIN_JWT_SECRET`을 fail-closed 방식으로 검증하고 반환한다.
 *
 * 아래 중 하나라도 해당하면 **즉시 throw** — admin 인증이 알려진/추측 가능한/공유된
 * 비밀값으로 "성공"하는 상황을 원천 차단한다. 절대 안전하지 않은 기본값으로
 * silently fallback하지 않는다:
 *
 *  1. 비어있거나 공백만 있음 (환경변수 미설정)
 *  2. 플레이스홀더 값(`'change-me-admin-secret'`)과 동일
 *  3. 일반 유저용 `JWT_SECRET`과 동일 — 두 시크릿이 같으면 일반 유저 JWT로 admin
 *     토큰을 위조하거나 그 반대가 가능해져, 두 인증 체계를 분리한 의미가 사라진다
 *
 * 호출 시점에 따라 결과가 다르다:
 *  - `AdminJwtStrategy` 생성자(모듈 초기화/부트스트랩 시점)에서 호출 → 설정이
 *    잘못되면 서버 자체가 기동하지 못한다. "관리자 기능만 조용히 망가진 채 운영
 *    환경에 배포되는" 것보다, 기동 시점에 크게 실패해 운영자가 즉시 알아차리게
 *    하는 편이 훨씬 안전하다 (fail fast).
 *  - `AdminAuthService.login()`에서도 동일 함수를 사용해 토큰 발급 단계에서도
 *    같은 기준으로 검증한다 (이중 방어).
 */
export function resolveAdminJwtSecret(config: ConfigService): string {
  const adminSecret = config.get<string>('ADMIN_JWT_SECRET');
  const userSecret = config.get<string>('JWT_SECRET');

  if (!adminSecret || adminSecret.trim().length === 0) {
    throw new Error(
      '[ADMIN AUTH 설정 오류] ADMIN_JWT_SECRET 환경변수가 설정되지 않았습니다. ' +
        'admin 인증은 알려진 기본값으로 동작할 수 없습니다 — .env에 충분히 길고 ' +
        '무작위적인 값(JWT_SECRET과 다른 값)을 ADMIN_JWT_SECRET으로 설정한 뒤 다시 시작하세요.',
    );
  }

  if (adminSecret === PLACEHOLDER_ADMIN_JWT_SECRET) {
    throw new Error(
      `[ADMIN AUTH 설정 오류] ADMIN_JWT_SECRET이 플레이스홀더 값("${PLACEHOLDER_ADMIN_JWT_SECRET}")` +
        '으로 설정되어 있습니다. 이 값은 코드에 공개되어 있어 누구나 admin 토큰을 위조할 수 ' +
        '있으므로 절대 그대로 사용할 수 없습니다 — 고유한 무작위 값으로 교체하세요.',
    );
  }

  if (userSecret && adminSecret === userSecret) {
    throw new Error(
      '[ADMIN AUTH 설정 오류] ADMIN_JWT_SECRET이 JWT_SECRET과 동일합니다. ' +
        '두 시크릿이 같으면 일반 유저 토큰과 admin 토큰이 서로 위조/혼용될 수 있어 ' +
        '인증 체계를 분리한 의미가 사라집니다 — 서로 다른 무작위 값을 사용하세요.',
    );
  }

  return adminSecret;
}
