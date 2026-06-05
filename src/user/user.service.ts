import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { UserRepository } from './user.repository';
import {
  MeResponse,
  NicknameCheckResponse,
  UpdateAvatarColorResponse,
  UpdateNicknameResponse,
  UpdateProfileImageResponse,
} from './dto/response/user.response';
import { BadRequestException, ConflictException, NotFoundException } from '../common/exception/custom.exception';
import { AuthExceptionMessage, UserExceptionMessage } from '../common/exception/exception.message';
import { R2StorageService } from '../storage/r2-storage.service';

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;
const AVATAR_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly r2StorageService: R2StorageService,
  ) {}

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

  async getMe(userId: number): Promise<MeResponse> {
    const profile = await this.userRepository.findProfileByUserId(userId);
    if (!profile) throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);

    const bestDb = profile.soloRecords[0]?.bestDb ?? 0;
    const profileImageUrl = profile.profileImageKey
      ? await this.r2StorageService.getSignedDownloadUrl(profile.profileImageKey)
      : null;

    return new MeResponse(
      profile.id,
      profile.nickname,
      profile.avatarColor,
      profileImageUrl,
      profile.streak,
      profile.wins,
      profile.losses,
      bestDb,
      profile.createdAt.toISOString(),
    );
  }

  async uploadProfileImage(
    userId: number,
    file: Express.Multer.File,
  ): Promise<UpdateProfileImageResponse> {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      throw new BadRequestException(UserExceptionMessage.PROFILE_IMAGE_INVALID_TYPE);
    if (file.size > MAX_IMAGE_SIZE)
      throw new BadRequestException(UserExceptionMessage.PROFILE_IMAGE_TOO_LARGE);

    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `profiles/${userId}/${randomUUID()}${ext}`;
    await this.r2StorageService.uploadObject(key, file.buffer, file.mimetype);

    await this.userRepository.updateProfileImageKey(userId, key);

    const signedUrl = await this.r2StorageService.getSignedDownloadUrl(key);
    return new UpdateProfileImageResponse(signedUrl);
  }

  async updateNickname(userId: number, nickname: string): Promise<UpdateNicknameResponse> {
    if (!nickname || nickname.length < 2)
      throw new BadRequestException(UserExceptionMessage.NICKNAME_TOO_SHORT);
    if (!NICKNAME_PATTERN.test(nickname))
      throw new BadRequestException(UserExceptionMessage.NICKNAME_INVALID_CHARS);

    const exists = await this.userRepository.existsByNickname(nickname);
    if (exists) throw new ConflictException(UserExceptionMessage.NICKNAME_ALREADY_EXISTS);

    const updated = await this.userRepository.updateNickname(userId, nickname);
    return new UpdateNicknameResponse(updated.nickname);
  }

  async updateAvatarColor(userId: number, avatarColor: string): Promise<UpdateAvatarColorResponse> {
    if (!AVATAR_COLOR_PATTERN.test(avatarColor))
      throw new BadRequestException(UserExceptionMessage.AVATAR_COLOR_INVALID);

    const updated = await this.userRepository.updateAvatarColor(userId, avatarColor);
    return new UpdateAvatarColorResponse(updated.avatarColor);
  }

  async deleteMe(userId: number): Promise<void> {
    const user = await this.userRepository.findUserByUserId(userId);
    if (!user) throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);

    // 1. R2 프로필 이미지 삭제 (실패해도 탈퇴 계속 진행)
    const profileImageKey = await this.userRepository.findProfileImageKey(userId);
    if (profileImageKey) {
      try {
        await this.r2StorageService.deleteObject(profileImageKey);
      } catch (err) {
        this.logger.error(`R2 프로필 이미지 삭제 실패 [userId=${userId}]`, err);
      }
    }

    // 2. DiaryRecord 삭제
    await this.userRepository.deleteDiaryRecords(userId);

    // 3. SoloRecord 삭제
    await this.userRepository.deleteSoloRecord(userId);

    // 4. User 삭제
    await this.userRepository.deleteUser(userId);
  }
}
