import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter, HttpExceptionFilter } from './common/filter/http-exception.filter';
import { AppLogger } from './common/logger/app-logger.service';

async function bootstrap() {
  // bufferLogs: useLogger 호출 전 로그를 버퍼링했다가 교체 후 flush (부트스트랩 로그 누락 방지)
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Nest 내부 로거(부트스트랩 로그 포함)까지 pino JSON structured logging으로 통일.
  // `new Logger(ctx)` 인스턴스도 Logger.overrideLogger를 통해 이 LoggerService로 위임된다.
  app.useLogger(app.get(AppLogger));

  // 순서 중요: AllExceptionsFilter를 먼저 등록해야 마지막 fallback으로 동작
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // ─── CORS (Admin SPA 등 브라우저 기반 클라이언트 대응, 2026-06-08 추가) ───
  // 기존 클라이언트(React Native 앱)는 브라우저가 아니라 CORS의 영향을 받지 않았으나,
  // Admin SPA(deci-duel-web)가 브라우저에서 직접 fetch로 호출하므로 cross-origin 허용이 필요.
  // 콤마로 구분된 허용 오리진 목록을 환경변수로 받고, 미설정 시 로컬 Admin SPA dev 서버만 허용한다.
  // 운영 배포 시 Cloudflare Pages 도메인 등을 CORS_ALLOWED_ORIGINS에 추가해야 한다.
  const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsAllowedOrigins,
    credentials: true,
  });

  // DTO class-validator 자동 검증
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // DTO에 없는 필드 자동 제거
      forbidNonWhitelisted: true, // 알 수 없는 필드 포함 시 400 에러
      transform: true,           // query param 등 타입 자동 변환 (string → number)
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
