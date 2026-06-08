import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { GameRoomStore } from '../game/game-room.store';
import type { AdminHealthResponse } from './dto/response/admin.response';

function readServerVersion(): string {
  try {
    // src/admin/.. /.. → 프로젝트 루트 (dist/admin에서도 동일하게 두 단계 위가 루트)
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function toMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

@Injectable()
export class AdminHealthService {
  private readonly serverVersion = readServerVersion();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gameRoomStore: GameRoomStore,
  ) {}

  async getHealth(): Promise<AdminHealthResponse> {
    const db = await this.checkDb();
    const mem = process.memoryUsage();
    const game = this.gameRoomStore.getStats();

    return {
      ok: db.status === 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: toMb(mem.rss),
        heapUsedMb: toMb(mem.heapUsed),
        heapTotalMb: toMb(mem.heapTotal),
      },
      nodeEnv: process.env.NODE_ENV ?? 'development',
      serverVersion: this.serverVersion,
      db,
      game,
    };
  }

  private async checkDb(): Promise<{ status: 'ok' | 'error'; latencyMs?: number }> {
    const start = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      return { status: 'ok', latencyMs: Math.round(latencyMs * 100) / 100 };
    } catch {
      return { status: 'error' };
    }
  }
}
