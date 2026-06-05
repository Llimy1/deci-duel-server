import { PrismaService } from '../prisma/prisma.service';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '../common/exception/custom.exception';
import { AuthExceptionMessage, UserExceptionMessage } from '../common/exception/exception.message';

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async existsByNickname(nickname: string): Promise<boolean> {
    try {
      const user: { id: number } | null = await this.prisma.user.findUnique({
        where: { nickname },
        select: { id: true },
      });
      return user !== null;
    } catch (err) {
      this.logger.error('existsByNickname 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findByProvider(authProvider: string, providerId: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { authProvider_providerId: { authProvider, providerId } },
        select: { id: true, nickname: true, refreshToken: true },
      });
    } catch (err) {
      this.logger.error('findByProvider 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async createOAuthUser(
    authProvider: string,
    providerId: string,
    nickname: string,
    termsVersion: string,
    privacyVersion: string,
  ) {
    try {
      return await this.prisma.user.create({
        data: {
          authProvider,
          providerId,
          nickname,
          termsVersion,
          privacyVersion,
          consentedAt: new Date(),
        },
        select: { id: true, nickname: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(UserExceptionMessage.NICKNAME_ALREADY_EXISTS);
      }
      this.logger.error('createOAuthUser 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async updateRefreshToken(userId: number, refreshToken: string | null) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { refreshToken },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
      }
      this.logger.error('updateRefreshToken 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findUserByUserId(userId: number) {
    try {
      return await this.prisma.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          nickname: true,
          refreshToken: true,
        },
      });
    } catch (err) {
      this.logger.error('findUserByUserId 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async updateNickname(userId: number, nickname: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { nickname },
        select: { id: true, nickname: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
        if (err.code === 'P2002') throw new ConflictException(UserExceptionMessage.NICKNAME_ALREADY_EXISTS);
      }
      this.logger.error('updateNickname 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async updateAvatarColor(userId: number, avatarColor: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { avatarColor },
        select: { id: true, avatarColor: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
      }
      this.logger.error('updateAvatarColor 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findProfileImageKey(userId: number): Promise<string | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { profileImageKey: true },
      });
      return user?.profileImageKey ?? null;
    } catch (err) {
      this.logger.error('findProfileImageKey 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async deleteDiaryRecords(userId: number): Promise<void> {
    try {
      await this.prisma.diaryRecord.deleteMany({ where: { userId } });
    } catch (err) {
      this.logger.error('deleteDiaryRecords 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async deleteSoloRecord(userId: number): Promise<void> {
    try {
      await this.prisma.soloRecord.deleteMany({ where: { userId } });
    } catch (err) {
      this.logger.error('deleteSoloRecord 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async deleteUser(userId: number) {
    try {
      return await this.prisma.user.delete({ where: { id: userId } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
      }
      this.logger.error('deleteUser 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async updateProfileImageKey(userId: number, profileImageKey: string) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { profileImageKey },
        select: { id: true, profileImageKey: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(AuthExceptionMessage.USER_NOT_FOUND);
      }
      this.logger.error('updateProfileImageKey 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async incrementWins(userId: number) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { wins: { increment: 1 } },
        select: { id: true, wins: true },
      });
    } catch (err) {
      this.logger.error('incrementWins 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async incrementLosses(userId: number) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { losses: { increment: 1 } },
        select: { id: true, losses: true },
      });
    } catch (err) {
      this.logger.error('incrementLosses 실패', err);
      throw new InternalServerErrorException();
    }
  }

  async findProfileByUserId(userId: number) {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          nickname: true,
          avatarColor: true,
          profileImageKey: true,
          streak: true,
          wins: true,
          losses: true,
          createdAt: true,
          soloRecords: {
            select: { bestDb: true },
            take: 1,
          },
        },
      });
    } catch (err) {
      this.logger.error('findProfileByUserId 실패', err);
      throw new InternalServerErrorException();
    }
  }
}
