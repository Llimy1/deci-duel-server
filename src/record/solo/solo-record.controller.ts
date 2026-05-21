import { Body, Controller, Get, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SoloRecordService } from './solo-record.service';
import { CreateSoloRecordRequest } from './dto/request/solo-record.request';
import * as authRequestInterface from '../../common/interfaces/auth-request.interface';
import { ApiResponse } from '../../common/dto/api-response.dto';
import { CreateSoloRecordResponse, FindSoloRecordResponse } from './dto/response/solo-record.response';
import { SoloRecordResponseMessage } from '../../common/enum/reponse-message.enum';

@Controller('solo')
export class SoloRecordController {
  constructor(private readonly soloRecordService: SoloRecordService) {}

  @UseGuards(JwtAuthGuard)
  @Post('record')
  async createSoloRecord(
    @Req() req: authRequestInterface.AuthRequest,
    @Body() dto: CreateSoloRecordRequest,
  ): Promise<ApiResponse<CreateSoloRecordResponse>> {
    const userId: number = req.user.userId;

    const result = await this.soloRecordService.createSoloRecord(userId, dto);

    return new ApiResponse(HttpStatus.CREATED, SoloRecordResponseMessage.SOLO_RECORD_CREATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Get('record')
  async findSoloRecord(@Req() req: authRequestInterface.AuthRequest): Promise<ApiResponse<FindSoloRecordResponse>> {
    const userId: number = req.user.userId;

    const result = await this.soloRecordService.findSoloRecord(userId);

    return new ApiResponse(HttpStatus.OK, SoloRecordResponseMessage.FIND_SOLO_RECORD_DATA_SUCCESS, result);
  }
}
