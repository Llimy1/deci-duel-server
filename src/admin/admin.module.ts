import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { GameModule } from '../game/game.module';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminHealthService } from './admin-health.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    GameModule,
    PassportModule,
    // 일반 유저 JwtModule(JWT_SECRET, 7d 기본 만료)과 분리 — admin은 매 호출마다
    // AdminAuthService/AdminJwtStrategy에서 ADMIN_JWT_SECRET/ADMIN_TOKEN_EXPIRES_IN을 직접 사용한다.
    JwtModule.register({}),
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminHealthService, AdminJwtStrategy],
})
export class AdminModule {}
