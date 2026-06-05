import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import {
  ExchangeAuthCodeRequest,
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

  // ─── 서버사이드 Kakao OAuth ──────────────────────────────────────

  @Get('oauth/kakao/init')
  async kakaoInit(
    @Query('redirectUri') redirectUri: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = this.authService.kakaoInitUrl(redirectUri);
    res.redirect(url);
  }

  @Get('oauth/kakao/callback')
  async kakaoCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.authService.kakaoCallback(code, state);
    res.redirect(redirectUrl);
  }

  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeAuthCode(
    @Body() dto: ExchangeAuthCodeRequest,
  ): Promise<ApiResponse<OAuthLoginResponse>> {
    const result = this.authService.exchangeAuthCode(dto.code);
    const message = result.isNewUser
      ? AuthResponseMessage.OAUTH_NEW_USER
      : AuthResponseMessage.LOGIN_SUCCESS;
    return new ApiResponse(HttpStatus.OK, message, result);
  }

  // ─── 서버사이드 Google OAuth ─────────────────────────────────────

  @Get('oauth/google/init')
  async googleInit(
    @Query('redirectUri') redirectUri: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = this.authService.googleInitUrl(redirectUri);
    res.redirect(url);
  }

  @Get('oauth/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const redirectUrl = await this.authService.googleCallback(code, state);
    res.redirect(redirectUrl);
  }

  // ─── 기존 앱사이드 OAuth (Apple 용도 유지) ───────────────────────

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
