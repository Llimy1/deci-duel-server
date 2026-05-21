import { UserService } from './user.service';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiResponse } from '../common/dto/api-response.dto';
import { UserResponseMessage } from '../common/enum/reponse-message.enum';
import { NicknameCheckResponse } from './dto/response/user.response';

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
}
