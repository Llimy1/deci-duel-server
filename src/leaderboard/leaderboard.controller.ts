import { Controller, Get, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import * as authRequestInterface from '../common/interfaces/auth-request.interface';
import { ApiResponse } from '../common/dto/api-response.dto';
import { GlobalLeaderboardResponse } from './dto/response/leaderboard.response';
import { LeaderboardResponseMessage } from '../common/enum/reponse-message.enum';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @UseGuards(JwtAuthGuard)
  @Get('global')
  async getGlobalLeaderboard(
    @Req() req: authRequestInterface.AuthRequest,
  ): Promise<ApiResponse<GlobalLeaderboardResponse>> {
    const userId: number = req.user.userId;
    const result = await this.leaderboardService.getGlobalLeaderboard(userId);
    return new ApiResponse(HttpStatus.OK, LeaderboardResponseMessage.GLOBAL_LEADERBOARD_SUCCESS, result);
  }
}
