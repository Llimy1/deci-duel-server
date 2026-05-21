import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { NicknameCheckResponse } from './dto/response/user.response';
import { BadRequestException, NotFoundException } from '../common/exception/custom.exception';
import { AuthExceptionMessage, UserExceptionMessage } from '../common/exception/exception.message';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async checkNickname(nickname: string): Promise<NicknameCheckResponse> {
    if (!nickname) throw new BadRequestException(UserExceptionMessage.NICKNAME_REQUIRED);
    const exists = await this.userRepository.existsByNickname(nickname);
    return new NicknameCheckResponse(!exists);
  }

  async findUser(userId: number) {
    const user = await this.userRepository.findUserByUserId(userId);

    if (!user) throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
    return user.id;
  }
}
