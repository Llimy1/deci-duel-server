import { Module } from '@nestjs/common';
import { SoloRecordController } from './solo-record.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { SoloRecordService } from './solo-record.service';
import { SoloRecordRepository } from './solo-record.repository';

@Module({
  imports: [PrismaModule],
  controllers: [SoloRecordController],
  providers: [SoloRecordService, SoloRecordRepository],
})
export class SoloRecordModule {}
