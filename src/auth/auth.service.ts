import { DevLoginRequest, DevSignupRequest, RefreshRequest } from './dto/request/auth.request';
import { DevLoginResponse, DevSignupResponse, RefreshResponse } from './dto/response/auth.response';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../user/user.repository';
import { ConflictException, NotFoundException, UnauthorizedException } from '../common/exception/custom.exception';
import { AuthExceptionMessage } from '../common/exception/exception.message';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async devSignup(dto: DevSignupRequest): Promise<DevSignupResponse> {
    const devId: string = dto.id;
    const devPassword: string = dto.password;
    const devNickname: string = dto.nickname;

    const existing = await this.userRepository.findUserByDevId(devId);
    if (existing) throw new ConflictException(AuthExceptionMessage.DUPLICATE_ID);

    const user = await this.userRepository.devSignup(devId, devPassword, devNickname, dto.termsVersion, dto.privacyVersion);
    const tokens = this.generateTokens(user.id, user.nickname);
    await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);

    return new DevSignupResponse(tokens.accessToken, tokens.refreshToken, user);
  }

  async devLogin(dto: DevLoginRequest): Promise<DevLoginResponse> {
    const devId: string = dto.id;
    const devPassword: string = dto.password;

    const user = await this.userRepository.findUserByDevId(devId);

    if (!user) throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
    if (user.devPassword !== devPassword) throw new UnauthorizedException(AuthExceptionMessage.INVALID_PASSWORD);

    const tokens = this.generateTokens(user.id, user.nickname);
    await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);

    return new DevLoginResponse(tokens.accessToken, tokens.refreshToken, user);
  }

  async refresh(dto: RefreshRequest): Promise<RefreshResponse> {
    let payload: { sub: number; nickname: string };
    try {
      payload = this.jwtService.verify(dto.refreshToken);
    } catch {
      throw new UnauthorizedException(AuthExceptionMessage.INVALID_TOKEN);
    }

    const user = await this.userRepository.findUserByUserId(payload.sub);
    if (!user || user.refreshToken !== dto.refreshToken)
      throw new UnauthorizedException(AuthExceptionMessage.INVALID_TOKEN);

    const tokens = this.generateTokens(user.id, user.nickname);
    await this.userRepository.updateRefreshToken(user.id, tokens.refreshToken);

    return new RefreshResponse(tokens.accessToken, tokens.refreshToken, user);
  }

  async logout(userId: number): Promise<void> {
    await this.userRepository.updateRefreshToken(userId, null);
  }

  generateTokens(userId: number, nickname: string) {
    const accessToken = this.jwtService.sign({ sub: userId, nickname }, { expiresIn: '15m' });

    const refreshToken = this.jwtService.sign({ sub: userId }, { expiresIn: '30d' });

    return { accessToken, refreshToken };
  }
}
