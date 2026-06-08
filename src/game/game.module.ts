import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameRoomStore } from './game-room.store';
import { UserRepository } from '../user/user.repository';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    // JwtService is needed by the gateway for token verification.
    // Secret is read from ConfigService inside the gateway itself.
    JwtModule.register({}),
    StorageModule,
  ],
  providers: [GameGateway, GameRoomStore, UserRepository],
  // GameRoomStore: AdminModule의 /admin/health에서 socket room/player count 조회용
  exports: [GameRoomStore],
})
export class GameModule {}
