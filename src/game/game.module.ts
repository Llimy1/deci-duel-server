import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GameGateway } from './game.gateway';
import { GameRoomStore } from './game-room.store';
import { UserRepository } from '../user/user.repository';

@Module({
  imports: [
    // JwtService is needed by the gateway for token verification.
    // Secret is read from ConfigService inside the gateway itself.
    JwtModule.register({}),
  ],
  providers: [GameGateway, GameRoomStore, UserRepository],
})
export class GameModule {}
