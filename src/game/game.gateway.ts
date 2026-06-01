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
import { GameRoom, GameState, PlayerInfo } from './types/game.types';
import { UserRepository } from '../user/user.repository';
import { R2StorageService } from '../storage/r2-storage.service';

/** Room TTL after game_over / rematch_waiting: 10 minutes */
const ROOM_TTL_MS = 10 * 60 * 1000;
/** Forfeit grace period during active gameplay: 10 seconds */
const FORFEIT_GRACE_MS = 10_000;
/** States where forfeit does NOT apply (no auto-cleanup on disconnect) */
const NO_FORFEIT_STATES: GameState[] = ['waiting', 'ready', 'game_over', 'rematch_waiting'];

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
    private readonly r2Storage: R2StorageService,
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

    const opponentId = this.getOpponentId(room, userId);

    // waiting with only the host → immediate cleanup
    if (room.state === 'waiting') {
      this.cleanupRoom(room);
      return;
    }

    // States with no forfeit: notify opponent and start/refresh TTL
    if ((NO_FORFEIT_STATES as string[]).includes(room.state)) {
      if (opponentId !== null) {
        const opponent = room.players.get(opponentId);
        if (opponent?.connected) {
          this.server.to(opponent.socketId).emit('opponent:disconnected', { waitSecs: 0 });
        }
      }
      // Ensure the room will eventually be cleaned up
      this.refreshTTL(room);
      return;
    }

    // Active gameplay: countdown / playing / round_end → 10s forfeit
    if (opponentId === null) {
      this.cleanupRoom(room);
      return;
    }

    const opponent = room.players.get(opponentId);
    if (opponent?.connected) {
      this.server.to(opponent.socketId).emit('opponent:disconnected', {
        waitSecs: FORFEIT_GRACE_MS / 1000,
      });
    }

    player.disconnectTimer = setTimeout(() => {
      this.handleForfeit(room, userId).catch(err =>
        this.logger.error('handleForfeit error', err),
      );
    }, FORFEIT_GRACE_MS);
  }

  /* ─────────────────────────── Reconnect helper ──────────────────────────── */

  private async tryReconnect(client: Socket, userId: number) {
    const room = this.store.getRoomByUserId(userId);
    if (!room) return;

    const player = room.players.get(userId);
    if (!player) return;

    // 게임이 비활성 상태(waiting/game_over)에서 소켓이 새로 연결되면
    // 재연결이 아닌 정상 접속 흐름으로 처리 — 방에서 조용히 제거하여 "이미 참여 중" 방지
    const reconnectStates: GameState[] = ['countdown', 'playing', 'round_end', 'ready', 'rematch_waiting'];
    if (!(reconnectStates as string[]).includes(room.state)) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
      }
      this.store.removeUser(userId);
      this.store.removeSocket(player.socketId);
      room.players.delete(userId);
      // 방이 비어있으면 정리
      if (room.players.size === 0) {
        this.cleanupRoom(room);
      }
      this.logger.log(`tryReconnect: inactive state(${room.state}), removed user=${userId} from room`);
      return;
    }

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }

    if (player.socketId) this.store.removeSocket(player.socketId);
    player.socketId = client.id;
    player.connected = true;
    this.store.registerSocket(client.id, room.roomCode);

    client.join(room.roomCode);

    const opponentId = this.getOpponentId(room, userId);
    if (opponentId !== null) {
      const opponent = room.players.get(opponentId);
      if (opponent?.connected) {
        this.server.to(opponent.socketId).emit('opponent:reconnected');
      }
    }

    const opponentInfo = opponentId !== null ? room.players.get(opponentId) : null;
    const myScore = room.scores.get(userId) ?? 0;
    const oppScore = opponentId !== null ? (room.scores.get(opponentId) ?? 0) : 0;

    const roundResults = room.roundRecords.map(r => ({
      round: r.round,
      myDb: r.submissions[userId] ?? 0,
      oppDb: opponentId !== null ? (r.submissions[opponentId] ?? 0) : 0,
    }));

    const opponentImageUrl = opponentInfo
      ? await this.getProfileImageUrl(opponentInfo.profileImageKey)
      : null;

    client.emit('room:reconnected', {
      roomCode: room.roomCode,
      isHost: player.isHost,
      myScore,
      oppScore,
      roundResults,
      opponent: opponentInfo
        ? {
            userId: opponentInfo.userId,
            nickname: opponentInfo.nickname,
            avatarColor: opponentInfo.avatarColor,
            profileImageUrl: opponentImageUrl,
            bestDb: opponentInfo.bestDb,
          }
        : null,
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
      profileImageKey: profile.profileImageKey ?? null,
      bestDb: profile.soloRecords[0]?.bestDb ?? 0,
      isHost: true,
      isReady: false,
      wantsRematch: false,
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

    // 게임 진행 중: 입장 불가
    const activeStates: GameState[] = ['countdown', 'playing', 'round_end'];
    if ((activeStates as string[]).includes(room.state)) {
      client.emit('error', { message: '이미 게임이 시작된 방입니다.' });
      return;
    }

    // 방이 가득 찬 경우: 입장 불가
    if (room.players.size >= 2) {
      client.emit('error', { message: '방이 가득 찼습니다.' });
      return;
    }

    // TTL 타이머 해제 (새 참가자 입장 시 TTL 취소)
    if (room.ttlTimer) {
      clearTimeout(room.ttlTimer);
      room.ttlTimer = null;
    }

    // waiting이 아닌 상태(game_over 등)에서 새 참가자 입장 시 게임 데이터 초기화
    if (room.state !== 'waiting') {
      this.resetGameData(room);
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
      profileImageKey: profile.profileImageKey ?? null,
      bestDb: profile.soloRecords[0]?.bestDb ?? 0,
      isHost: false,
      isReady: false,
      wantsRematch: false,
      connected: true,
      roundSubmissions: {},
      disconnectTimer: null,
    };

    room.players.set(userId, player);
    room.state = 'ready';
    this.store.registerSocket(client.id, roomCode);
    this.store.registerUser(userId, roomCode);

    client.join(roomCode);

    const hostId = this.getOpponentId(room, userId)!;
    const host = room.players.get(hostId)!;

    const [hostImageUrl, guestImageUrl] = await Promise.all([
      this.getProfileImageUrl(host.profileImageKey),
      this.getProfileImageUrl(player.profileImageKey),
    ]);

    // 게스트에게: 상대(방장) 정보 + 내가 게스트임을 전달
    client.emit('room:joined', {
      roomCode,
      isHost: false,
      opponent: {
        userId: host.userId,
        nickname: host.nickname,
        avatarColor: host.avatarColor,
        bestDb: host.bestDb,
        profileImageUrl: hostImageUrl,
      },
    });

    // 방장에게: 상대(게스트) 정보 + 방장 유지 확인
    this.server.to(host.socketId).emit('opponent:joined', {
      userId: player.userId,
      nickname: player.nickname,
      avatarColor: player.avatarColor,
      bestDb: player.bestDb,
      profileImageUrl: guestImageUrl,
      isHost: true,
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

    // Notify opponent that this player is now ready
    const opponentId = this.getOpponentId(room, userId);
    if (opponentId !== null) {
      this.emitToPlayer(room, opponentId, 'opponent:ready', {});
    }

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

  /* ─────────────────────────── Event: round:db ───────────────────────────── */

  @SubscribeMessage('round:db')
  onRoundDb(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { round: number; db: number },
  ): void {
    const userId = client.data.userId as number;
    const room = this.store.getRoomBySocketId(client.id);

    if (!room || room.state !== 'playing') return;
    if ((data?.round ?? -1) !== room.currentRound) return;

    const clampedDb = Math.max(0, Math.min(200, Number(data?.db) || 0));

    const opponentId = this.getOpponentId(room, userId);
    if (opponentId === null) return;

    this.emitToPlayer(room, opponentId, 'opponent:db', {
      round: room.currentRound,
      db: clampedDb,
    });
  }

  /* ─────────────────────────── Event: game:rematch ───────────────────────── */

  @SubscribeMessage('game:rematch')
  onGameRematch(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId as number;
    const room = this.store.getRoomByUserId(userId);

    if (!room) {
      client.emit('error', { message: '방을 찾을 수 없습니다.' });
      return;
    }
    const rematchAllowed: GameState[] = ['game_over', 'rematch_waiting'];
    if (!(rematchAllowed as string[]).includes(room.state)) {
      client.emit('error', { message: '재대결을 요청할 수 없는 상태입니다.' });
      return;
    }

    const player = room.players.get(userId);
    if (!player) return;

    player.wantsRematch = true;
    room.state = 'rematch_waiting';

    client.emit('rematch:waiting', { roomCode: room.roomCode });
    this.logger.log(`rematch:waiting  code=${room.roomCode}  userId=${userId}`);

    // 상대가 방에 있고 이미 rematch를 원하면 즉시 시작
    const opponentId = this.getOpponentId(room, userId);
    if (opponentId !== null) {
      const opponent = room.players.get(opponentId);
      if (opponent?.wantsRematch) {
        this.startRematch(room);
      }
    }
    // 상대가 없거나 아직 rematch 의사 없으면 rematch_waiting 유지 → room:join 대기
  }

  /* ─────────────────────────── Event: room:leave ────────────────────────── */

  @SubscribeMessage('room:leave')
  onRoomLeave(@ConnectedSocket() client: Socket): void {
    const userId = client.data.userId as number;
    const room = this.store.getRoomByUserId(userId);
    if (!room) return;

    const player = room.players.get(userId);
    if (!player) return;

    const opponentId = this.getOpponentId(room, userId);
    this.logger.log(`room:leave  code=${room.roomCode}  userId=${userId}  state=${room.state}`);

    // 활성 게임 중 명시적 이탈 → 즉시 forfeit (grace period 없음)
    const activeStates: GameState[] = ['countdown', 'playing', 'round_end'];
    if ((activeStates as string[]).includes(room.state)) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
      }
      this.store.removeUser(userId);
      this.store.removeSocket(player.socketId);
      room.players.delete(userId);
      client.leave(room.roomCode);

      this.handleForfeit(room, userId).catch(err =>
        this.logger.error('handleForfeit on room:leave error', err),
      );
      return;
    }

    // 비활성 상태에서 이탈 → 즉시 슬롯 해제
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    const wasHost = player.isHost;
    this.store.removeUser(userId);
    this.store.removeSocket(player.socketId);
    room.players.delete(userId);
    client.leave(room.roomCode);

    // 남은 플레이어 없음 → 방 정리
    if (room.players.size === 0) {
      this.cleanupRoom(room);
      return;
    }

    // 1명 남음 → waiting 상태로 초기화 (새 상대 대기)
    room.state = 'waiting';
    room.currentRound = 0;
    room.scores.clear();
    room.roundRecords = [];
    if (room.ttlTimer) {
      clearTimeout(room.ttlTimer);
      room.ttlTimer = null;
    }
    room.players.forEach(p => {
      p.isReady = false;
      p.wantsRematch = false;
      p.roundSubmissions = {};
    });

    const remaining = opponentId !== null ? room.players.get(opponentId) : null;
    if (!remaining?.connected) {
      // 남은 플레이어도 연결 없음 → 방 정리
      this.cleanupRoom(room);
      return;
    }

    if (wasHost) {
      // 방장이 나감 → 남은 플레이어를 새 방장으로 승격
      remaining.isHost = true;
      this.emitToPlayer(room, remaining.userId, 'room:host_transferred', {
        roomCode: room.roomCode,
      });
      this.logger.log(`host transferred  code=${room.roomCode}  newHost=${remaining.userId}`);
    } else {
      // 게스트가 나감 → 기존 방장 유지, 상대 떠남 알림
      this.emitToPlayer(room, remaining.userId, 'opponent:left', {});
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

    if (db1 > db2) {
      room.scores.set(p1.userId, (room.scores.get(p1.userId) ?? 0) + 1);
    } else if (db2 > db1) {
      room.scores.set(p2.userId, (room.scores.get(p2.userId) ?? 0) + 1);
    }

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

    // Keep room alive for rematch — TTL will clean it up if unused
    this.refreshTTL(room);
  }

  private async handleForfeit(room: GameRoom, forfeitUserId: number) {
    if (room.state === 'game_over') return;

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

    // Keep room alive for rematch
    this.refreshTTL(room);
  }

  private startRematch(room: GameRoom): void {
    if (room.ttlTimer) {
      clearTimeout(room.ttlTimer);
      room.ttlTimer = null;
    }

    this.resetGameData(room);

    this.server.to(room.roomCode).emit('rematch:matched', {
      roomCode: room.roomCode,
    });

    this.logger.log(`rematch started  code=${room.roomCode}`);
  }

  /* ─────────────────────────── Utilities ────────────────────────────────── */

  /** Reset game data for a fresh match (keeps players, clears scores/rounds). */
  private resetGameData(room: GameRoom): void {
    room.state = 'ready';
    room.currentRound = 0;
    room.scores.clear();
    room.roundRecords = [];
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
    room.players.forEach(p => {
      p.isReady = false;
      p.wantsRematch = false;
      p.roundSubmissions = {};
    });
  }

  /** Start or refresh the room TTL timer. */
  private refreshTTL(room: GameRoom, ms = ROOM_TTL_MS): void {
    if (room.ttlTimer) clearTimeout(room.ttlTimer);
    room.ttlTimer = setTimeout(() => {
      this.logger.log(`TTL expired  code=${room.roomCode}`);
      this.cleanupRoom(room);
    }, ms);
  }

  /** R2 서명 URL 생성. key가 없거나 실패 시 null 반환 (방 입장 실패로 이어지지 않도록). */
  private async getProfileImageUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.r2Storage.getSignedDownloadUrl(key);
    } catch (err) {
      this.logger.warn(`프로필 이미지 URL 생성 실패 [key=${key}]`, err);
      return null;
    }
  }

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
    if (room.ttlTimer) {
      clearTimeout(room.ttlTimer);
      room.ttlTimer = null;
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
