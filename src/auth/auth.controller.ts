import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  OAuthLoginRequest,
  OAuthSignupRequest,
  RefreshRequest,
} from './dto/request/auth.request';
import { ApiResponse } from '../common/dto/api-response.dto';
import {
  OAuthLoginResponse,
  OAuthSignupResponse,
  RefreshResponse,
} from './dto/response/auth.response';
import { AuthResponseMessage } from '../common/enum/reponse-message.enum';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import * as authRequestInterface from '../common/interfaces/auth-request.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── 네이티브 SDK 기반 OAuth (Apple/Google/Kakao 공통 진입점) ────
  // NOTE: 과거 서버사이드 Authorization Code Flow 엔드포인트
  // (oauth/kakao/init|callback, oauth/google/init|callback, oauth/exchange)는
  // 네이티브 SDK 전환(2026-06-07)에 따라 제거됨. 앱은 더 이상 호출하지 않음.

  @Post('oauth')
  @HttpCode(HttpStatus.OK)
  async oauthLogin(
    @Body() dto: OAuthLoginRequest,
  ): Promise<ApiResponse<OAuthLoginResponse>> {
    const result = await this.authService.oauthLogin(dto.provider, dto.idToken, dto.accessToken);
    const message = result.isNewUser
      ? AuthResponseMessage.OAUTH_NEW_USER
      : AuthResponseMessage.LOGIN_SUCCESS;
    return new ApiResponse(HttpStatus.OK, message, result);
  }

  @Post('oauth/signup')
  async oauthSignup(
    @Body() dto: OAuthSignupRequest,
  ): Promise<ApiResponse<OAuthSignupResponse>> {
    const result = await this.authService.completeOAuthSignup(
      dto.signupToken,
      dto.nickname,
      dto.termsVersion,
      dto.privacyVersion,
    );
    return new ApiResponse(HttpStatus.CREATED, AuthResponseMessage.SIGNUP_SUCCESS, result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshRequest: RefreshRequest): Promise<ApiResponse<RefreshResponse>> {
    const result = await this.authService.refresh(refreshRequest);
    return new ApiResponse(HttpStatus.OK, AuthResponseMessage.REFRESH_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: authRequestInterface.AuthRequest): Promise<ApiResponse<null>> {
    await this.authService.logout(req.user.userId);
    return new ApiResponse(HttpStatus.OK, AuthResponseMessage.LOGOUT_SUCCESS, null);
  }
}
