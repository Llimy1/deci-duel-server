import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DiaryService } from './diary.service';
import * as authRequestInterface from '../common/interfaces/auth-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDiaryRequest, UpdateDiaryRequest } from './dto/request/diary.request';
import { ApiResponse } from '../common/dto/api-response.dto';
import {
  CreateDiaryResponse,
  DeleteDiaryResponse,
  FindDiaryByDateResponse,
  FindMonthlyDiaryResponse,
  UpdateDiaryResponse,
} from './dto/response/diary.response';
import { DiaryResponseMessage } from '../common/enum/reponse-message.enum';

@Controller('diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createDiary(
    @Req() req: authRequestInterface.AuthRequest,
    @Body() dto: CreateDiaryRequest,
  ): Promise<ApiResponse<CreateDiaryResponse>> {
    const userId = req.user.userId;
    const result = await this.diaryService.createDiary(userId, dto);
    return new ApiResponse(HttpStatus.CREATED, DiaryResponseMessage.DIARY_CREATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findMonthlyDiary(
    @Req() req: authRequestInterface.AuthRequest,
    @Query('year') year: string,
    @Query('month') month: string,
  ): Promise<ApiResponse<FindMonthlyDiaryResponse>> {
    const userId = req.user.userId;
    const result = await this.diaryService.findMonthlyDiary(userId, Number(year), Number(month));
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_MONTHLY_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':date')
  async findDiaryByDate(
    @Req() req: authRequestInterface.AuthRequest,
    @Param('date') date: string,
  ): Promise<ApiResponse<FindDiaryByDateResponse>> {
    const userId = req.user.userId;
    const result = await this.diaryService.findDiaryByDate(userId, date);
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_DATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':date')
  async updateDiary(
    @Req() req: authRequestInterface.AuthRequest,
    @Param('date') date: string,
    @Body() dto: UpdateDiaryRequest,
  ): Promise<ApiResponse<UpdateDiaryResponse>> {
    const userId = req.user.userId;
    const result = await this.diaryService.updateDiary(userId, date, dto);
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_UPDATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':date')
  async deleteDiary(
    @Req() req: authRequestInterface.AuthRequest,
    @Param('date') date: string,
  ): Promise<ApiResponse<DeleteDiaryResponse>> {
    const userId = req.user.userId;
    const result = await this.diaryService.deleteDiary(userId, date);
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_DELETE_SUCCESS, result);
  }
}
