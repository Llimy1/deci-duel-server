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
}
