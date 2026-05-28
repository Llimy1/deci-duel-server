import {
  BadRequestException,
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Patch, Post, Query, Req, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { ApiResponse } from '../common/dto/api-response.dto';
import { UserResponseMessage } from '../common/enum/reponse-message.enum';
import {
  MeResponse, NicknameCheckResponse,
  UpdateAvatarColorResponse, UpdateNicknameResponse,
  UpdateProfileImageResponse,
} from './dto/response/user.response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as authRequestInterface from '../common/interfaces/auth-request.interface';
import { UpdateAvatarColorRequest, UpdateNicknameRequest } from './dto/request/user.request';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('nickname/check')
  async checkNickname(@Query('nickname') nickname: string): Promise<ApiResponse<NicknameCheckResponse>> {
    const result = await this.userService.checkNickname(nickname);
    return new ApiResponse(
      HttpStatus.OK,
      result.available ? UserResponseMessage.NICKNAME_AVAILABLE : UserResponseMessage.NICKNAME_ALREADY_EXISTS,
      result,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: authRequestInterface.AuthRequest): Promise<ApiResponse<MeResponse>> {
    const result = await this.userService.getMe(req.user.userId);
    return new ApiResponse(HttpStatus.OK, UserResponseMessage.ME_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/profile-image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadProfileImage(
    @Req() req: authRequestInterface.AuthRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ApiResponse<UpdateProfileImageResponse>> {
    if (!file) throw new BadRequestException('이미지 파일이 필요합니다.');
    const result = await this.userService.uploadProfileImage(req.user.userId, file);
    return new ApiResponse(HttpStatus.OK, UserResponseMessage.PROFILE_IMAGE_UPDATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/nickname')
  async updateNickname(
    @Req() req: authRequestInterface.AuthRequest,
    @Body() dto: UpdateNicknameRequest,
  ): Promise<ApiResponse<UpdateNicknameResponse>> {
    const result = await this.userService.updateNickname(req.user.userId, dto.nickname);
    return new ApiResponse(HttpStatus.OK, UserResponseMessage.NICKNAME_UPDATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/avatar-color')
  async updateAvatarColor(
    @Req() req: authRequestInterface.AuthRequest,
    @Body() dto: UpdateAvatarColorRequest,
  ): Promise<ApiResponse<UpdateAvatarColorResponse>> {
    const result = await this.userService.updateAvatarColor(req.user.userId, dto.avatarColor);
    return new ApiResponse(HttpStatus.OK, UserResponseMessage.AVATAR_COLOR_UPDATE_SUCCESS, result);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async deleteMe(@Req() req: authRequestInterface.AuthRequest): Promise<ApiResponse<null>> {
    await this.userService.deleteMe(req.user.userId);
    return new ApiResponse(HttpStatus.OK, UserResponseMessage.DELETE_SUCCESS, null);
  }
}
