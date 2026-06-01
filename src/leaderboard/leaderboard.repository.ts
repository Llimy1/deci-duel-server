import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InternalServerErrorException } from '../common/exception/custom.exception';

const TOP_N = 50;

// Service 레이어에서 URL 변환 전 내부 타입
export interface LeaderboardEntryRaw {
  rank: number;
  userId: number;
  nickname: string;
  avatarColor: string;
  bestDb: number;
  profileImageKey: string | null;
}

@Injectable()
export class LeaderboardRepository {
  private readonly logger = new Logger(LeaderboardRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTopEntries(): Promise<LeaderboardEntryRaw[]> {
    try {
      // 1) 기록 있는 유저: bestDb DESC
      const records = await this.prisma.soloRecord.findMany({
        orderBy: { bestDb: 'desc' },
        take: TOP_N,
        select: {
          userId: true,
          bestDb: true,
          user: { select: { nickname: true, avatarColor: true, profileImageKey: true } },
        },
      });

      const result: LeaderboardEntryRaw[] = records.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        nickname: r.user.nickname,
        avatarColor: r.user.avatarColor,
        bestDb: r.bestDb,
        profileImageKey: r.user.profileImageKey ?? null,
      }));

      // 2) 남은 슬롯: 솔로 기록 없는 유저 (bestDb = 0), 가입 순
      const remaining = TOP_N - result.length;
      if (remaining > 0) {
        const noRecordUsers = await this.prisma.user.findMany({
          where: { soloRecords: { none: {} } },
          take: remaining,
          orderBy: { id: 'asc' },
          select: { id: true, nickname: true, avatarColor: true, profileImageKey: true },
        });

        noRecordUsers.forEach((u, i) => {
          result.push({
            rank: records.length + i + 1,
            userId: u.id,
            nickname: u.nickname,
            avatarColor: u.avatarColor,
            bestDb: 0,
            profileImageKey: u.profileImageKey ?? null,
          });
        });
      }

      return result;
    } catch (err) {
      this.logger.error('getTopEntries 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async getMyEntry(userId: number): Promise<LeaderboardEntryRaw | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { nickname: true, avatarColor: true, profileImageKey: true },
      });
      if (!user) return null;

      const myRecord = await this.prisma.soloRecord.findUnique({ where: { userId } });

      if (!myRecord) {
        // 순위 = (기록 있는 유저 수) + (나보다 먼저 가입한 무기록 유저 수) + 1
        const [withRecordCount, noRecordBeforeMe] = await Promise.all([
          this.prisma.soloRecord.count(),
          this.prisma.user.count({
            where: { soloRecords: { none: {} }, id: { lt: userId } },
          }),
        ]);
        return {
          rank: withRecordCount + noRecordBeforeMe + 1,
          userId,
          nickname: user.nickname,
          avatarColor: user.avatarColor,
          bestDb: 0,
          profileImageKey: user.profileImageKey ?? null,
        };
      }

      const higherCount = await this.prisma.soloRecord.count({
        where: { bestDb: { gt: myRecord.bestDb } },
      });

      return {
        rank: higherCount + 1,
        userId,
        nickname: user.nickname,
        avatarColor: user.avatarColor,
        bestDb: myRecord.bestDb,
        profileImageKey: user.profileImageKey ?? null,
      };
    } catch (err) {
      this.logger.error('getMyEntry 실패', err);
      throw new InternalServerErrorException();
    }
  }
}
