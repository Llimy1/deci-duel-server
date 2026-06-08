import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { SoloRecordModule } from './record/solo/solo-record.module';
import { DiaryModule } from './diary/diary.module';
import { GameModule } from './game/game.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { LoggerModule } from './common/logger/logger.module';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { OperationalEventModule } from './common/operational-event/operational-event.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    PrismaModule,
    OperationalEventModule,
    UserModule,
    AuthModule,
    SoloRecordModule,
    DiaryModule,
    GameModule,
    LeaderboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // requestId/요청 컨텍스트는 가장 먼저 적용되어야 이후 모든 로직에서 조회 가능
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
