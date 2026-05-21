import { Injectable } from '@nestjs/common';
import { SoloRecordRepository } from './solo-record.repository';
import { CreateSoloRecordResponse, FindSoloRecordResponse } from './dto/response/solo-record.response';
import { CreateSoloRecordRequest } from './dto/request/solo-record.request';

@Injectable()
export class SoloRecordService {
  constructor(private readonly soloRecordRepository: SoloRecordRepository) {}

  async createSoloRecord(userId: number, dto: CreateSoloRecordRequest): Promise<CreateSoloRecordResponse> {
    await this.soloRecordRepository.upsertSoloRecord(userId, dto.peakDb);

    return new CreateSoloRecordResponse(true);
  }

  async findSoloRecord(userId: number): Promise<FindSoloRecordResponse> {
    const soloRecordData = await this.soloRecordRepository.findSoloRecordByUserId(userId);

    const peakDb: number = soloRecordData?.peakDb ?? 0;
    const bestDb: number = soloRecordData?.bestDb ?? 0;

    return new FindSoloRecordResponse(peakDb, bestDb);
  }
}
