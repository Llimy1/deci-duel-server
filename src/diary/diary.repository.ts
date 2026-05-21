import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DiaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertDiary(userId: number, peakDb: number, emoji: string, comment: string, date: string) {
    const dateObj = new Date(date);
    return this.prisma.diaryRecord.upsert({
      where: { userId_date: { userId, date: dateObj } },
      create: { userId, peakDb, emoji, comment, date: dateObj },
      update: { peakDb, emoji, comment },
    });
  }

  async findMonthlyDiary(userId: number, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    return this.prisma.diaryRecord.findMany({
      where: {
        userId,
        date: { gte: start, lt: end },
      },
      select: { date: true, peakDb: true, emoji: true, comment: true },
      orderBy: { date: 'asc' },
    });
  }

  async findDiaryByDate(userId: number, date: string) {
    return this.prisma.diaryRecord.findFirst({
      where: { userId, date: new Date(date) },
      select: { date: true, peakDb: true, emoji: true, comment: true },
    });
  }

  async updateDiary(userId: number, date: string, emoji: string, comment: string) {
    return this.prisma.diaryRecord.update({
      where: { userId_date: { userId, date: new Date(date) } },
      data: { emoji, comment },
    });
  }

  async deleteDiary(userId: number, date: string) {
    return this.prisma.diaryRecord.delete({
      where: { userId_date: { userId, date: new Date(date) } },
    });
  }
}
