import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { GameRoomStore } from './game-room.store';
import { GameRoom, PlayerInfo } from './types/game.types';
import { UserRepository } from '../user/user.repository';

@WebSocketGateway({
  namespace: '/game',
  cors: { origin: '*' },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private readonly store: GameRoomStore,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {}

  /* ─────────────────────────── Connection lifecycle ─────────────────────── */

  async handleConnection(client: Socket) {
    const token = client.handshake?.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<{ sub: number; nickname: string }>(
        token,
        { secret: this.configService.get<string>('JWT_SECRET') },
      );
      client.data.userId = payload.sub;
      client.data.nickname = payload.nickname;
    } catch {
      client.disconnect();
      return;
    }

    const userId = client.data.userId as number;
    this.logger.log(`connected  userId=${userId}  socket=${client.id}`);

    // Restore a previous session if the user was already in a room
    await this.tryReconnect(client, userId);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as number | undefined;
    if (!userId) return;

    this.logger.log(`disconnected  userId=${userId}  socket=${client.id}`);

    const room = this.store.getRoomBySocketId(client.id);
    this.store.removeSocket(client.id);

    if (!room) return;

    const player = room.players.get(userId);
    if (!player) return;

    player.connected = false;

    // Room still has only the host → destroy
    if (room.state === 'waiting') {
      this.cleanupRoom(room);
      return;
    }

    // Game already finished → no-op
    if (room.state === 'game_over') return;

    // Notify opponent and start forfeit timer
    const opponentId = this.getOpponentId(room, userId);
    if (opponentId === null) {
      this.cleanupRoom(room);
      return;
    }

    const opponent = room.players.get(opponentId);
    if (opponent?.connected) {
      this.server.to(opponent.socketId).emit('opponent:disconnected', { waitSecs: 5 });
    }

    player.disconnectTimer = setTimeout(() => {
      this.handleForfeit(room, userId).catch(err =>
        this.logger.error('handleForfeit error', err),
      );
    }, 5000);
  }

  /* ─────────────────────────── Reconnect helper ──────────────────────────── */

  private async tryReconnect(client: Socket, userId: number) {
    const room = this.store.getRoomByUserId(userId);
    if (!room) return;

    const player = room.players.get(userId);
    if (!player) return;

    // Cancel pending forfeit timer
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    // Update socket mapping
    if (player.socketId) this.store.removeSocket(player.socketId);
    player.socketId = client.id;
    player.connected = true;
    this.store.registerSocket(client.id, room.roomCode);

    // Rejoin socket.io room
    client.join(room.roomCode);

    // Notify opponent
    const opponentId = this.getOpponentId(room, userId);
    if (opponentId !== null) {
      const opponent = room.players.get(opponentId);
      if (opponent?.connected) {
        this.server.to(opponent.socketId).emit('opponent:reconnected');
      }
    }

    // Send state snapshot so the client can resume
    client.emit('room:reconnected', {
      roomCode: room.roomCode,
      state: room.state,
      currentRound: room.currentRound,
    });
  }

  /* ─────────────────────────── Event: room:create ───────────────────────── */

  @SubscribeMessage('room:create')
  async onRoomCreate(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as number;

    if (this.store.getRoomByUserId(userId)) {
      client.emit('error', { message: '이미 방에 참여 중입니다.' });
      return;
    }

    const profile = await this.userRepository.findProfileByUserId(userId);
    if (!profile) {
      client.emit('error', { message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const roomCode = this.store.generateRoomCode();
    const room = this.store.createRoom(roomCode);

    const player: PlayerInfo = {
      userId,
      nickname: profile.nickname,
      socketId: client.id,
      avatarColor: profile.avatarColor ?? '#6C5CE7',
      isReady: false,
      connected: true,
      roundSubmissions: {},
      disconnectTimer: null,
    };

    room.players.set(userId, player);
    this.store.registerSocket(client.id, roomCode);
    this.store.registerUser(userId, roomCode);

    client.join(roomCode);
    client.emit('room:created', { roomCode });

    this.logger.log(`room created  code=${roomCode}  host=${userId}`);
  }

  /* ─────────────────────────── Event: room:join ──────────────────────────── */

  @SubscribeMessage('room:join')
  async onRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string },
  ) {
    const userId = client.data.userId as number;
    const roomCode = (data?.roomCode ?? '').toUpperCase().trim();

    if (this.store.getRoomByUserId(userId)) {
      client.emit('error', { message: '이미 방에 참여 중입니다.' });
      return;
    }

    const room = this.store.getRoom(roomCode);
    if (!room) {
      client.emit('error', { message: '존재하지 않는 방 코드입니다.' });
      return;
    }
    if (room.players.size >= 2) {
      client.emit('error', { message: '방이 가득 찼습니다.' });
      return;
    }
    if (room.state !== 'waiting') {
      client.emit('error', { message: '이미 게임이 시작된 방입니다.' });
      return;
    }

    const profile = await this.userRepository.findProfileByUserId(userId);
    if (!profile) {
      client.emit('error', { message: '사용자를 찾을 수 없습니다.' });
      return;
    }

    const player: PlayerInfo = {
      userId,
      nickname: profile.nickname,
      socketId: client.id,
      avatarColor: profile.avatarColor ?? '#6C5CE7',
      isReady: false,
      connected: true,
      roundSubmissions: {},
      disconnectTimer: null,
    };

    room.players.set(userId, player);
    room.state = 'ready';
    this.store.registerSocket(client.id, roomCode);
    this.store.registerUser(userId, roomCode);

    client.join(roomCode);

    // Find the host (the other player)
    const hostId = this.getOpponentId(room, userId)!;
    const host = room.players.get(hostId)!;

    // Notify joiner
    client.emit('room:joined', {
      roomCode,
      opponent: {
        userId: host.userId,
        nickname: host.nickname,
        avatarColor: host.avatarColor,
      },
    });

    // Notify host
    this.server.to(host.socketId).emit('opponent:joined', {
      userId: player.userId,
      nickname: player.nickname,
      avatarColor: player.avatarColor,
    });

    this.logger.log(`room joined  code=${roomCode}  guest=${userId}`);
  }

  /* ─────────────────────────── Event: game:ready ─────────────────────────── */

  @SubscribeMessage('game:ready')
  onGameReady(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as number;
    const room = this.store.getRoomByUserId(userId);

    if (!room) {
      client.emit('error', { message: '방을 찾을 수 없습니다.' });
      return;
    }
    if (room.state !== 'ready') {
      client.emit('error', { message: '준비 상태가 아닙니다.' });
      return;
    }

    const player = room.players.get(userId);
    if (!player) return;

    player.isReady = true;

    const allReady = [...room.players.values()].every(p => p.isReady);
    if (allReady) {
      room.state = 'countdown';
      this.startCountdown(room);
    }
  }

  /* ─────────────────────────── Event: round:submit ───────────────────────── */

  @SubscribeMessage('round:submit')
  onRoundSubmit(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { round: number; peakDb: number },
  ) {
    const userId = client.data.userId as number;
    const room = this.store.getRoomByUserId(userId);

    if (!room || room.state !== 'playing') return;

    const { round, peakDb } = data ?? {};
    if (round !== room.currentRound) return;

    const player = room.players.get(userId);
    if (!player || player.roundSubmissions[round] !== undefined) return;

    player.roundSubmissions[round] = Math.max(0, Math.min(200, Number(peakDb) || 0));

    const allSubmitted = [...room.players.values()].every(
      p => p.roundSubmissions[round] !== undefined,
    );

    if (allSubmitted) {
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      this.resolveRound(room);
    }
  }

  /* ─────────────────────────── Game logic ────────────────────────────────── */

  private startCountdown(room: GameRoom) {
    let count = 3;
    this.server.to(room.roomCode).emit('round:countdown', { count });

    const tick = () => {
      count--;
      this.server.to(room.roomCode).emit('round:countdown', { count });
      if (count > 0) {
        setTimeout(tick, 1000);
      } else {
        // count === 0  →  "GO!"  →  start round shortly after
        setTimeout(() => this.startRound(room), 500);
      }
    };
    setTimeout(tick, 1000);
  }

  private startRound(room: GameRoom) {
    if (room.state === 'game_over') return;

    room.state = 'playing';
    room.currentRound++;

    this.server.to(room.roomCode).emit('round:start', { round: room.currentRound });

    // Hard-close the round after 5.5 s
    room.roundTimer = setTimeout(() => {
      this.resolveRound(room);
    }, room.roundDurationMs);
  }

  private resolveRound(room: GameRoom) {
    if (room.state !== 'playing') return;

    room.state = 'round_end';
    const round = room.currentRound;
    const players = [...room.players.values()];
    const [p1, p2] = players;

    const db1 = p1.roundSubmissions[round] ?? 0;
    const db2 = p2.roundSubmissions[round] ?? 0;

    // Tally scores
    if (db1 > db2) {
      room.scores.set(p1.userId, (room.scores.get(p1.userId) ?? 0) + 1);
    } else if (db2 > db1) {
      room.scores.set(p2.userId, (room.scores.get(p2.userId) ?? 0) + 1);
    }
    // draw → no increment

    room.roundRecords.push({
      round,
      submissions: { [p1.userId]: db1, [p2.userId]: db2 },
    });

    const score1 = room.scores.get(p1.userId) ?? 0;
    const score2 = room.scores.get(p2.userId) ?? 0;
    const roundWinner = db1 > db2 ? p1.userId : db2 > db1 ? p2.userId : null;

    this.emitToPlayer(room, p1.userId, 'round:result', {
      round,
      myDb: db1,
      oppDb: db2,
      roundResult: roundWinner === null ? 'draw' : roundWinner === p1.userId ? 'win' : 'lose',
      myScore: score1,
      oppScore: score2,
    });

    this.emitToPlayer(room, p2.userId, 'round:result', {
      round,
      myDb: db2,
      oppDb: db1,
      roundResult: roundWinner === null ? 'draw' : roundWinner === p2.userId ? 'win' : 'lose',
      myScore: score2,
      oppScore: score1,
    });

    if (round >= room.totalRounds) {
      setTimeout(() => {
        this.finishGame(room).catch(err =>
          this.logger.error('finishGame error', err),
        );
      }, 1500);
    } else {
      room.state = 'countdown';
      setTimeout(() => this.startCountdown(room), 2000);
    }
  }

  private async finishGame(room: GameRoom) {
    if (room.state === 'game_over') return;
    room.state = 'game_over';

    const players = [...room.players.values()];
    const [p1, p2] = players;

    const score1 = room.scores.get(p1.userId) ?? 0;
    const score2 = room.scores.get(p2.userId) ?? 0;

    const winner: number | null =
      score1 > score2 ? p1.userId : score2 > score1 ? p2.userId : null;

    const buildRounds = (myId: number, oppId: number) =>
      room.roundRecords.map(r => ({
        round: r.round,
        myDb: r.submissions[myId] ?? 0,
        oppDb: r.submissions[oppId] ?? 0,
      }));

    this.emitToPlayer(room, p1.userId, 'game:over', {
      result: winner === null ? 'draw' : winner === p1.userId ? 'win' : 'lose',
      myScore: score1,
      oppScore: score2,
      rounds: buildRounds(p1.userId, p2.userId),
    });

    this.emitToPlayer(room, p2.userId, 'game:over', {
      result: winner === null ? 'draw' : winner === p2.userId ? 'win' : 'lose',
      myScore: score2,
      oppScore: score1,
      rounds: buildRounds(p2.userId, p1.userId),
    });

    // Persist result
    if (winner !== null) {
      const loserId = winner === p1.userId ? p2.userId : p1.userId;
      await Promise.all([
        this.userRepository.incrementWins(winner),
        this.userRepository.incrementLosses(loserId),
      ]).catch(err => this.logger.error('DB win/loss update failed', err));
    }

    this.cleanupRoom(room);
  }

  private async handleForfeit(room: GameRoom, forfeitUserId: number) {
    if (room.state === 'game_over') return;

    // Cancel any running round timer
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }

    room.state = 'game_over';

    const opponentId = this.getOpponentId(room, forfeitUserId);
    if (opponentId === null) {
      this.cleanupRoom(room);
      return;
    }

    const opponentScore = room.scores.get(opponentId) ?? 0;
    const forfeitScore = room.scores.get(forfeitUserId) ?? 0;

    // Notify the still-connected opponent
    this.emitToPlayer(room, opponentId, 'game:over', {
      result: 'win',
      myScore: opponentScore,
      oppScore: forfeitScore,
      rounds: room.roundRecords.map(r => ({
        round: r.round,
        myDb: r.submissions[opponentId] ?? 0,
        oppDb: r.submissions[forfeitUserId] ?? 0,
      })),
      forfeit: true,
    });

    // Persist result
    await Promise.all([
      this.userRepository.incrementWins(opponentId),
      this.userRepository.incrementLosses(forfeitUserId),
    ]).catch(err => this.logger.error('DB forfeit update failed', err));

    this.cleanupRoom(room);
  }

  /* ─────────────────────────── Utilities ────────────────────────────────── */

  private getOpponentId(room: GameRoom, userId: number): number | null {
    for (const [pid] of room.players) {
      if (pid !== userId) return pid;
    }
    return null;
  }

  private emitToPlayer(room: GameRoom, userId: number, event: string, data: unknown) {
    const player = room.players.get(userId);
    if (player?.connected && player.socketId) {
      this.server.to(player.socketId).emit(event, data);
    }
  }

  private cleanupRoom(room: GameRoom) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.players.forEach(p => {
      if (p.disconnectTimer) {
        clearTimeout(p.disconnectTimer);
        p.disconnectTimer = null;
      }
      this.store.removeUser(p.userId);
      this.store.removeSocket(p.socketId);
    });
    this.store.deleteRoom(room.roomCode);
    this.logger.log(`room cleaned  code=${room.roomCode}`);
  }
}
