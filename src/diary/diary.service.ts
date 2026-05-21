import { Injectable } from '@nestjs/common';
import { NotFoundException } from '../common/exception/custom.exception';
import { DiaryExceptionMessage } from '../common/exception/exception.message';
import { DiaryRepository } from './diary.repository';
import { CreateDiaryRequest, UpdateDiaryRequest } from './dto/request/diary.request';
import {
  CreateDiaryResponse,
  DeleteDiaryResponse,
  DiaryEntryResponse,
  FindDiaryByDateResponse,
  FindMonthlyDiaryResponse,
  UpdateDiaryResponse,
} from './dto/response/diary.response';

@Injectable()
export class DiaryService {
  constructor(private readonly diaryRepository: DiaryRepository) {}

  async createDiary(userId: number, dto: CreateDiaryRequest): Promise<CreateDiaryResponse> {
    await this.diaryRepository.upsertDiary(userId, dto.peakDb, dto.emoji, dto.comment, dto.date);
    return new CreateDiaryResponse(true);
  }

  async findMonthlyDiary(userId: number, year: number, month: number): Promise<FindMonthlyDiaryResponse> {
    const records = await this.diaryRepository.findMonthlyDiary(userId, year, month);
    const entries = records.map(
      (r) => new DiaryEntryResponse(r.date.toISOString().split('T')[0], r.peakDb, r.emoji, r.comment),
    );
    return new FindMonthlyDiaryResponse(entries);
  }

  async findDiaryByDate(userId: number, date: string): Promise<FindDiaryByDateResponse> {
    const record = await this.diaryRepository.findDiaryByDate(userId, date);
    if (!record) throw new NotFoundException(DiaryExceptionMessage.DIARY_NOT_FOUND);
    return new FindDiaryByDateResponse(
      record.date.toISOString().split('T')[0],
      record.peakDb,
      record.emoji,
      record.comment,
    );
  }

  async updateDiary(userId: number, date: string, dto: UpdateDiaryRequest): Promise<UpdateDiaryResponse> {
    const record = await this.diaryRepository.findDiaryByDate(userId, date);
    if (!record) throw new NotFoundException(DiaryExceptionMessage.DIARY_NOT_FOUND);
    await this.diaryRepository.updateDiary(userId, date, dto.emoji, dto.comment);
    return new UpdateDiaryResponse(true);
  }

  async deleteDiary(userId: number, date: string): Promise<DeleteDiaryResponse> {
    const record = await this.diaryRepository.findDiaryByDate(userId, date);
    if (!record) throw new NotFoundException(DiaryExceptionMessage.DIARY_NOT_FOUND);
    await this.diaryRepository.deleteDiary(userId, date);
    return new DeleteDiaryResponse(true);
  }
}
