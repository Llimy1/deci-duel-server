import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '../common/exception/custom.exception';
import { DiaryExceptionMessage } from '../common/exception/exception.message';

function parseDate(dateStr: string): Date {
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    throw new BadRequestException(`날짜 형식이 올바르지 않습니다. (입력값: ${dateStr})`);
  }
  return dateObj;
}

@Injectable()
export class DiaryRepository {
  private readonly logger = new Logger(DiaryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertDiary(userId: number, peakDb: number, emoji: string, comment: string, date: string) {
    const dateObj = parseDate(date);
    try {
      return await this.prisma.diaryRecord.upsert({
        where: { userId_date: { userId, date: dateObj } },
        create: { userId, peakDb, emoji, comment, date: dateObj },
        update: { peakDb, emoji, comment },
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('upsertDiary 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findMonthlyDiary(userId: number, year: number, month: number) {
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new BadRequestException('연도 또는 월 값이 올바르지 않습니다.');
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    try {
      return await this.prisma.diaryRecord.findMany({
        where: {
          userId,
          date: { gte: start, lt: end },
        },
        select: { date: true, peakDb: true, emoji: true, comment: true },
        orderBy: { date: 'asc' },
      });
    } catch (err) {
      this.logger.error('findMonthlyDiary 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findDiaryByDate(userId: number, date: string) {
    const dateObj = parseDate(date);
    try {
      return await this.prisma.diaryRecord.findFirst({
        where: { userId, date: dateObj },
        select: { date: true, peakDb: true, emoji: true, comment: true },
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error('findDiaryByDate 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async updateDiary(userId: number, date: string, emoji: string, comment: string) {
    const dateObj = parseDate(date);
    try {
      return await this.prisma.diaryRecord.update({
        where: { userId_date: { userId, date: dateObj } },
        data: { emoji, comment },
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(DiaryExceptionMessage.DIARY_NOT_FOUND);
      }
      this.logger.error('updateDiary 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async deleteDiary(userId: number, date: string) {
    const dateObj = parseDate(date);
    try {
      return await this.prisma.diaryRecord.delete({
        where: { userId_date: { userId, date: dateObj } },
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(DiaryExceptionMessage.DIARY_NOT_FOUND);
      }
      this.logger.error('deleteDiary 실패', err);
      throw new InternalServerErrorException();
    }
  }
}
