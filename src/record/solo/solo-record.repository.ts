import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SoloRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSoloRecord(userId: number, peakDb: number) {
    const existing = await this.prisma.soloRecord.findUnique({ where: { userId } });
    const newBestDb = existing ? Math.max(existing.bestDb, peakDb) : peakDb;

    return this.prisma.soloRecord.upsert({
      where: { userId },
      create: { userId, peakDb, bestDb: peakDb },
      update: { peakDb, bestDb: newBestDb },
    });
  }

  async findSoloRecordByUserId(userId: number) {
    return this.prisma.soloRecord.findUnique({
      where: { userId },
      select: { peakDb: true, bestDb: true },
    });
  }
}
