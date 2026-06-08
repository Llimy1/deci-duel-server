import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
// Jest는 기본적으로 NODE_ENV=test로 실행한다 (jest-cli가 자동 설정).
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;

// LOG_PRETTY로 강제 on/off 가능. 미설정 시 production/test가 아니면 pretty 출력.
//
// ⚠️ 테스트 환경에서는 명시적으로 LOG_PRETTY=true를 주지 않는 한 절대 pretty transport를
// 켜지 않는다. `pino({ transport: { target: 'pino-pretty' } })`는 내부적으로 별도의
// worker thread를 띄우는데, 이 모듈(`rootLogger`)은 `AppLogger`를 거쳐 거의 모든
// 컨트롤러 통합 테스트(spec 파일)에서 import된다 — Jest는 spec 파일마다 격리된 모듈
// 레지스트리를 사용하므로, spec 파일 수만큼 pino-pretty worker thread가 생성되고
// 한 번도 종료되지 않는다. 이것이 "Jest did not exit one second after the test run
// has completed / 워커가 강제 종료됨" 경고의 root cause였다 (Codex 리뷰 수정 필요 5).
//
// 테스트에서는 사람이 읽기 좋은 출력이 필요 없으므로(JSON 한 줄 로그로도 충분히 디버깅
// 가능), worker thread를 만들지 않는 동기 transport-less 모드로 강제한다.
const usePretty = process.env.LOG_PRETTY
  ? process.env.LOG_PRETTY === 'true'
  : !isProduction && !isTest;

/**
 * 앱 전역에서 공유하는 단일 pino 인스턴스.
 *
 * - production: stdout에 한 줄짜리 JSON 로그 (수집기/aggregator 친화적)
 * - local 개발: pino-pretty transport로 사람이 읽기 좋은 컬러 출력
 *
 * 절대 로그에 남기면 안 되는 값(redact 2차 방어선 — 1차는 "애초에 안 넘기기"):
 * accessToken/refreshToken/idToken/password/secret/admin code/Authorization 헤더 원문
 */
export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  base: { service: 'deci-duel-server' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'accessToken',
      'refreshToken',
      'idToken',
      'token',
      'password',
      'secret',
      'code',
      'adminAccessCode',
      '*.accessToken',
      '*.refreshToken',
      '*.idToken',
      '*.token',
      '*.password',
      '*.secret',
      '*.code',
      'metadata.accessToken',
      'metadata.refreshToken',
      'metadata.idToken',
      'metadata.token',
      'metadata.password',
      'metadata.secret',
      'metadata.code',
    ],
    censor: '[REDACTED]',
  },
  transport: usePretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          singleLine: true,
          ignore: 'pid,hostname,service',
        },
      }
    : undefined,
});
