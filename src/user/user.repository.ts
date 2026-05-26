import { PrismaService } from '../prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async existsByNickname(nickname: string): Promise<boolean> {
    const user: { id: number } | null = await this.prisma.user.findUnique({
      where: { nickname },
      select: { id: true },
    });

    return user !== null;
  }

  async devSignup(devId: string, devPassword: string, devNickname: string) {
    return this.prisma.user.create({
      data: {
        devId: devId,
        devPassword: devPassword,
        nickname: devNickname,
        authProvider: 'dev',
      },
      select: {
        id: true,
        nickname: true,
      },
    });
  }

  async updateRefreshToken(userId: number, refreshToken: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken,
      },
    });
  }

  async findUserByDevId(devId: string) {
    return this.prisma.user.findFirst({
      where: { devId: devId },
      select: {
        id: true,
        nickname: true,
        devPassword: true,
      },
    });
  }

  async findUserByUserId(userId: number) {
    return this.prisma.user.findFirst({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        refreshToken: true,
      },
    });
  }

  async updateNickname(userId: number, nickname: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { nickname },
      select: { id: true, nickname: true },
    });
  }

  async updateAvatarColor(userId: number, avatarColor: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarColor },
      select: { id: true, avatarColor: true },
    });
  }

  async deleteUser(userId: number) {
    return this.prisma.user.delete({ where: { id: userId } });
  }

  async updateProfileImageKey(userId: number, profileImageKey: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { profileImageKey },
      select: { id: true, profileImageKey: true },
    });
  }

  async findProfileByUserId(userId: number) {
    return this.prisma.user.findUnique({
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
  }
}
