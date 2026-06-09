import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // AWS RDS는 rds.force_ssl=1이 기본값이므로 pg 어댑터에 SSL 명시 필요.
    // Prisma CLI(Rust 엔진)는 SSL을 자동 처리하지만 Node.js pg 라이브러리는 명시 필요.
    // rejectUnauthorized: false → RDS 자체 CA 인증서 검증 건너뜀 (운영 환경 RDS 표준 패턴).
    const isProduction = process.env.NODE_ENV === 'production';
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      ...(isProduction && { ssl: { rejectUnauthorized: false } }),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
