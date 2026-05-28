import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter, HttpExceptionFilter } from './common/filter/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 순서 중요: AllExceptionsFilter를 먼저 등록해야 마지막 fallback으로 동작
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

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
