import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InternalServerErrorException } from '../../common/exception/custom.exception';

@Injectable()
export class SoloRecordRepository {
  private readonly logger = new Logger(SoloRecordRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertSoloRecord(userId: number, peakDb: number) {
    try {
      const existing = await this.prisma.soloRecord.findUnique({ where: { userId } });
      const newBestDb = existing ? Math.max(existing.bestDb, peakDb) : peakDb;

      return await this.prisma.soloRecord.upsert({
        where: { userId },
        create: { userId, peakDb, bestDb: peakDb },
        update: { peakDb, bestDb: newBestDb },
      });
    } catch (err) {
      this.logger.error('upsertSoloRecord 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findSoloRecordByUserId(userId: number) {
    try {
      return await this.prisma.soloRecord.findUnique({
        where: { userId },
        select: { peakDb: true, bestDb: true },
      });
    } catch (err) {
      this.logger.error('findSoloRecordByUserId 실패', err);
      throw new InternalServerErrorException();
    }
  }
}
