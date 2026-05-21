import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiaryService } from './diary.service';
import { DiaryController } from './diary.controller';
import { DiaryRepository } from './diary.repository';

@Module({
  imports: [PrismaModule],
  controllers: [DiaryController],
  providers: [DiaryService, DiaryRepository],
})
export class DiaryModule {}
