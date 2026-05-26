import { Body, Controller, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DevLoginRequest, DevSignupRequest, RefreshRequest } from './dto/request/auth.request';
import { ApiResponse } from '../common/dto/api-response.dto';
import { DevLoginResponse, DevSignupResponse, RefreshResponse } from './dto/response/auth.response';
import { AuthResponseMessage } from '../common/enum/reponse-message.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import * as authRequestInterface from '../common/interfaces/auth-request.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('dev/signup')
  async devSignup(@Body() devSignupRequest: DevSignupRequest): Promise<ApiResponse<DevSignupResponse>> {
    const result = await this.authService.devSignup(devSignupRequest);

    return new ApiResponse(HttpStatus.CREATED, AuthResponseMessage.SIGNUP_SUCCESS, result);
  }

  @Post('dev/login')
  async devLogin(@Body() devLoginRequest: DevLoginRequest): Promise<ApiResponse<DevLoginResponse>> {
    const result = await this.authService.devLogin(devLoginRequest);

    return new ApiResponse(HttpStatus.OK, AuthResponseMessage.LOGIN_SUCCESS, result);
  }

  @Post('refresh')
  async refresh(@Body() refreshRequest: RefreshRequest): Promise<ApiResponse<RefreshResponse>> {
    const result = await this.authService.refresh(refreshRequest);

    return new ApiResponse(HttpStatus.OK, AuthResponseMessage.REFRESH_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: authRequestInterface.AuthRequest): Promise<ApiResponse<null>> {
    await this.authService.logout(req.user.userId);

    return new ApiResponse(HttpStatus.OK, AuthResponseMessage.LOGOUT_SUCCESS, null);
  }
}
