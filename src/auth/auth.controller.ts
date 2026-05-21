import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DevLoginRequest, DevSignupRequest, RefreshRequest } from './dto/request/auth.request';
import { ApiResponse } from '../common/dto/api-response.dto';
import { DevLoginResponse, DevSignupResponse, RefreshResponse } from './dto/response/auth.response';
import { AuthResponseMessage } from '../common/enum/reponse-message.enum';

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
}
