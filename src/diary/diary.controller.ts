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
import { BadRequestException } from '../common/exception/custom.exception';
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
    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!year || !month || isNaN(yearNum) || isNaN(monthNum)) {
      throw new BadRequestException('year, month 쿼리 파라미터가 필요합니다.');
    }
    if (monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('month는 1~12 사이의 값이어야 합니다.');
    }
    if (yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException('year는 2000~2100 사이의 값이어야 합니다.');
    }
    const result = await this.diaryService.findMonthlyDiary(userId, yearNum, monthNum);
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_MONTHLY_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':date')
  async findDiaryByDate(
    @Req() req: authRequestInterface.AuthRequest,
    @Param('date') date: string,
  ): Promise<ApiResponse<FindDiaryByDateResponse>> {
    validateDateParam(date);
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
    validateDateParam(date);
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
    validateDateParam(date);
    const userId = req.user.userId;
    const result = await this.diaryService.deleteDiary(userId, date);
    return new ApiResponse(HttpStatus.OK, DiaryResponseMessage.DIARY_DELETE_SUCCESS, result);
  }
}

/** YYYY-MM-DD 형식 검증 + 실존하는 날짜인지 확인 */
function validateDateParam(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestException('날짜 형식은 YYYY-MM-DD여야 합니다.');
  }
  const [year, month, day] = date.split('-').map(Number);
  // new Date(year, month-1, day)은 날짜가 overflow되면 자동 보정되므로
  // getDate()가 입력한 day와 다르면 존재하지 않는 날짜다.
  if (new Date(year, month - 1, day).getDate() !== day) {
    throw new BadRequestException('존재하지 않는 날짜입니다.');
  }
}
