import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiResponse } from '../common/dto/api-response.dto';
import { OperationalEventService } from '../common/operational-event/operational-event.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminHealthService } from './admin-health.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminEventsQuery, AdminLoginRequest } from './dto/request/admin.request';
import {
  AdminEventsResponse,
  AdminHealthResponse,
  AdminLoginResponse,
} from './dto/response/admin.response';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminHealthService: AdminHealthService,
    private readonly operationalEvents: OperationalEventService,
  ) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: AdminLoginRequest,
    @Req() req: Request,
  ): Promise<ApiResponse<AdminLoginResponse>> {
    const result = await this.adminAuthService.login(dto.code, req.ip);
    return new ApiResponse(HttpStatus.OK, '관리자 로그인에 성공했습니다.', result);
  }

  @UseGuards(AdminJwtGuard)
  @Get('health')
  async health(): Promise<ApiResponse<AdminHealthResponse>> {
    const result = await this.adminHealthService.getHealth();
    return new ApiResponse(HttpStatus.OK, '서버 상태 조회에 성공했습니다.', result);
  }

  @UseGuards(AdminJwtGuard)
  @Get('events')
  async events(@Query() query: AdminEventsQuery): Promise<ApiResponse<AdminEventsResponse>> {
    const { items, nextCursor, hasMore } = await this.operationalEvents.findMany({
      level: query.level,
      category: query.category,
      event: query.event,
      userId: query.userId,
      requestId: query.requestId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    return new ApiResponse(HttpStatus.OK, '운영 이벤트 조회에 성공했습니다.', {
      items,
      nextCursor,
      hasMore,
    });
  }
}
