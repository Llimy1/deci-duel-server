/**
 * GameGateway integration tests
 *
 * 실제 NestJS 앱을 random port에 올리고 socket.io-client로 연결한 뒤,
 * 모든 WebSocket 이벤트를 end-to-end로 검증합니다.
 *
 * 테스트 구조:
 *  - Connection     : 토큰 검증 (빠름)
 *  - Room management: room:create / room:join 경계 케이스 (빠름)
 *  - Game flow      : countdown → round → result (느림, 실제 타이머)
 *  - Disconnect     : 연결 끊김·몰수패 처리 (느림, 5 s 타이머)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { GameGateway } from './game.gateway';
import { GameRoomStore } from './game-room.store';
import { UserRepository } from '../user/user.repository';

/* ──────────────── 공통 설정 ──────────────── */

const TEST_SECRET = 'test-jwt-secret';

const fakeProfile = (nickname: string, avatarColor = '#6C5CE7') => ({
  id: 1,
  nickname,
  avatarColor,
  profileImageKey: null,
  streak: 0,
  wins: 0,
  losses: 0,
  createdAt: new Date(),
  soloRecords: [],
});

describe('GameGateway (integration)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let port: number;

  // 각 테스트에서 생성한 소켓을 추적 → afterEach에서 일괄 정리
  const activeSockets = new Set<ClientSocket>();

  const mockUserRepo = {
    findProfileByUserId: jest.fn(),
    incrementWins: jest.fn().mockResolvedValue({ id: 0, wins: 1 }),
    incrementLosses: jest.fn().mockResolvedValue({ id: 0, losses: 1 }),
  };

  /* ── 앱 부트스트랩 ── */
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: TEST_SECRET })],
      providers: [
        GameGateway,
        GameRoomStore,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0); // OS가 빈 포트 자동 할당
    port = (app.getHttpServer().address() as AddressInfo).port;
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());

  afterEach(async () => {
    // 테스트 실패 시에도 소켓·방이 정리되도록 보장
    const pending = [...activeSockets].map(
      s =>
        new Promise<void>(resolve => {
          if (!s.connected) { activeSockets.delete(s); resolve(); return; }
          s.once('disconnect', () => { activeSockets.delete(s); resolve(); });
          s.disconnect();
        }),
    );
    await Promise.all(pending);
    activeSockets.clear();
    // 서버 측 handleDisconnect가 완료될 때까지 미세 대기
    await delay(150);
    jest.clearAllMocks();
    mockUserRepo.incrementWins.mockResolvedValue({ id: 0, wins: 1 });
    mockUserRepo.incrementLosses.mockResolvedValue({ id: 0, losses: 1 });
  });

  /* ── 테스트 유틸 ── */

  const connect = (userId: number, nickname: string): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
      const token = jwtService.sign({ sub: userId, nickname }, { expiresIn: '15m' });
      const socket = io(`http://localhost:${port}/game`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });
      activeSockets.add(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', err => { activeSockets.delete(socket); reject(err); });
    });

  /** 지정 이벤트가 올 때까지 기다림. 시간 초과 시 reject. */
  const waitFor = <T = unknown>(socket: ClientSocket, event: string, ms = 5000): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`waitFor("${event}") timed out after ${ms}ms`)),
        ms,
      );
      socket.once(event, (data: T) => { clearTimeout(t); resolve(data); });
    });

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  /**
   * 2명의 플레이어가 방에 참여한 상태까지 설정.
   * mockUserRepo.findProfileByUserId 를 직접 세팅해야 함.
   */
  const setupRoom = async (
    hostId: number,
    guestId: number,
  ): Promise<{ host: ClientSocket; guest: ClientSocket; roomCode: string }> => {
    const host = await connect(hostId, `user-${hostId}`);
    const guest = await connect(guestId, `user-${guestId}`);

    const { roomCode } = await new Promise<{ roomCode: string }>(resolve => {
      host.once('room:created', resolve);
      host.emit('room:create');
    });

    await Promise.all([
      waitFor(guest, 'room:joined'),
      waitFor(host, 'opponent:joined'),
      Promise.resolve(guest.emit('room:join', { roomCode })),
    ]);

    return { host, guest, roomCode };
  };

  /**
   * 두 소켓이 게임을 시작하고 1라운드 round:start 까지 진행.
   * (countdown 3.5 s 소요)
   */
  const startGame = async (host: ClientSocket, guest: ClientSocket) => {
    await Promise.all([
      waitFor(host, 'round:start', 7000),
      waitFor(guest, 'round:start', 7000),
      Promise.resolve(host.emit('game:ready')),
      Promise.resolve(guest.emit('game:ready')),
    ]);
  };

  /* ═══════════════════════════════════════════════════════════════
   * 1. Connection
   * ═══════════════════════════════════════════════════════════════ */
  describe('Connection', () => {
    it('유효한 토큰 → 연결 성공', async () => {
      const socket = await connect(1, '테스터');
      expect(socket.connected).toBe(true);
    });

    it('토큰 없음 → 서버가 연결 거부', async () => {
      const result = await new Promise<string>(resolve => {
        const socket = io(`http://localhost:${port}/game`, {
          transports: ['websocket'],
          reconnection: false,
        });
        activeSockets.add(socket);
        socket.on('disconnect', reason => resolve(reason));
        socket.on('connect_error', () => resolve('connect_error'));
      });
      expect(['transport close', 'io server disconnect', 'connect_error']).toContain(result);
    });

    it('잘못된 토큰 → 서버가 연결 거부', async () => {
      const result = await new Promise<string>(resolve => {
        const socket = io(`http://localhost:${port}/game`, {
          auth: { token: 'bad.token.value' },
          transports: ['websocket'],
          reconnection: false,
        });
        activeSockets.add(socket);
        socket.on('disconnect', reason => resolve(reason));
        socket.on('connect_error', () => resolve('connect_error'));
      });
      expect(['transport close', 'io server disconnect', 'connect_error']).toContain(result);
    });
  });

  /* ═══════════════════════════════════════════════════════════════
   * 2. room:create
   * ═══════════════════════════════════════════════════════════════ */
  describe('room:create', () => {
    it('성공 → room:created { roomCode: 6자리 }', async () => {
      mockUserRepo.findProfileByUserId.mockResolvedValue(fakeProfile('호스트'));
      const host = await connect(10, '호스트');

      const result = await new Promise<{ roomCode: string }>(resolve => {
        host.once('room:created', resolve);
        host.emit('room:create');
      });

      expect(result.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    });

    it('이미 방에 있을 때 room:create → error', async () => {
      mockUserRepo.findProfileByUserId.mockResolvedValue(fakeProfile('호스트'));
      const host = await connect(11, '호스트');

      await new Promise<void>(resolve => { host.once('room:created', () => resolve()); host.emit('room:create'); });

      const err = await new Promise<{ message: string }>(resolve => {
        host.once('error', resolve);
        host.emit('room:create');
      });

      expect(err.message).toBe('이미 방에 참여 중입니다.');
    });
  });

  /* ═══════════════════════════════════════════════════════════════
   * 3. room:join
   * ═══════════════════════════════════════════════════════════════ */
  describe('room:join', () => {
    it('성공 → joiner: room:joined, host: opponent:joined', async () => {
      mockUserRepo.findProfileByUserId
        .mockResolvedValueOnce(fakeProfile('호스트', '#FF0000'))
        .mockResolvedValueOnce(fakeProfile('게스트', '#00FF00'));

      const host = await connect(20, '호스트');
      const guest = await connect(21, '게스트');

      const { roomCode } = await new Promise<{ roomCode: string }>(resolve => {
        host.once('room:created', resolve);
        host.emit('room:create');
      });

      const [joined, opponentJoined] = await Promise.all([
        waitFor<{ roomCode: string; opponent: { nickname: string; avatarColor: string } }>(
          guest, 'room:joined',
        ),
        waitFor<{ nickname: string; avatarColor: string }>(host, 'opponent:joined'),
        Promise.resolve(guest.emit('room:join', { roomCode })),
      ]);

      expect(joined.roomCode).toBe(roomCode);
      expect(joined.opponent).toMatchObject({ nickname: '호스트', avatarColor: '#FF0000' });
      expect(opponentJoined).toMatchObject({ nickname: '게스트', avatarColor: '#00FF00' });
    });

    it('소문자 방 코드도 허용 (대소문자 무관)', async () => {
      mockUserRepo.findProfileByUserId
        .mockResolvedValueOnce(fakeProfile('호스트'))
        .mockResolvedValueOnce(fakeProfile('게스트'));

      const host = await connect(22, '호스트');
      const guest = await connect(23, '게스트');

      const { roomCode } = await new Promise<{ roomCode: string }>(resolve => {
        host.once('room:created', resolve);
        host.emit('room:create');
      });

      const joined = await new Promise<{ roomCode: string }>(resolve => {
        guest.once('room:joined', resolve);
        guest.emit('room:join', { roomCode: roomCode.toLowerCase() }); // 소문자로 전송
      });

      expect(joined.roomCode).toBe(roomCode);
    });

    it('존재하지 않는 방 코드 → error', async () => {
      const socket = await connect(24, '방랑자');

      const err = await new Promise<{ message: string }>(resolve => {
        socket.once('error', resolve);
        socket.emit('room:join', { roomCode: 'XXXXXX' });
      });

      expect(err.message).toBe('존재하지 않는 방 코드입니다.');
    });

    it('만석인 방 참여 → error', async () => {
      mockUserRepo.findProfileByUserId
        .mockResolvedValueOnce(fakeProfile('호스트'))
        .mockResolvedValueOnce(fakeProfile('게스트'))
        .mockResolvedValueOnce(fakeProfile('침입자'));

      const host = await connect(30, '호스트');
      const guest = await connect(31, '게스트');
      const intruder = await connect(32, '침입자');

      const { roomCode } = await new Promise<{ roomCode: string }>(resolve => {
        host.once('room:created', resolve);
        host.emit('room:create');
      });

      await Promise.all([
        waitFor(guest, 'room:joined'),
        waitFor(host, 'opponent:joined'),
        Promise.resolve(guest.emit('room:join', { roomCode })),
      ]);

      const err = await new Promise<{ message: string }>(resolve => {
        intruder.once('error', resolve);
        intruder.emit('room:join', { roomCode });
      });

      expect(err.message).toBe('방이 가득 찼습니다.');
    });

    it('이미 방에 있는 사용자가 다른 방에 join → error', async () => {
      mockUserRepo.findProfileByUserId
        .mockResolvedValueOnce(fakeProfile('호스트1'))
        .mockResolvedValueOnce(fakeProfile('호스트2'))
        .mockResolvedValueOnce(fakeProfile('게스트'));

      const host1 = await connect(40, '호스트1');
      const host2 = await connect(41, '호스트2');
      const guest = await connect(42, '게스트');

      const [r1, r2] = await Promise.all([
        new Promise<{ roomCode: string }>(resolve => { host1.once('room:created', resolve); host1.emit('room:create'); }),
        new Promise<{ roomCode: string }>(resolve => { host2.once('room:created', resolve); host2.emit('room:create'); }),
      ]);

      // guest joins room1
      await Promise.all([
        waitFor(guest, 'room:joined'),
        Promise.resolve(guest.emit('room:join', { roomCode: r1.roomCode })),
      ]);

      // guest tries to join room2 while already in room1
      const err = await new Promise<{ message: string }>(resolve => {
        guest.once('error', resolve);
        guest.emit('room:join', { roomCode: r2.roomCode });
      });

      expect(err.message).toBe('이미 방에 참여 중입니다.');
    });
  });

  /* ═══════════════════════════════════════════════════════════════
   * 4. Game flow  (실제 타이머 사용 → 느림)
   * ═══════════════════════════════════════════════════════════════ */
  describe('Game flow', () => {
    beforeEach(() => {
      // 두 유저 모두 동일한 profile mock으로 처리
      mockUserRepo.findProfileByUserId.mockImplementation((id: number) =>
        Promise.resolve(fakeProfile(`user-${id}`)),
      );
    });

    it(
      '양쪽 game:ready → countdown 3→2→1→0 → round:start { round: 1 }',
      async () => {
        const { host, guest } = await setupRoom(100, 101);

        const hostCounts: number[] = [];
        const guestCounts: number[] = [];
        host.on('round:countdown', ({ count }: { count: number }) => hostCounts.push(count));
        guest.on('round:countdown', ({ count }: { count: number }) => guestCounts.push(count));

        const [hostStart, guestStart] = await Promise.all([
          waitFor<{ round: number }>(host, 'round:start', 7000),
          waitFor<{ round: number }>(guest, 'round:start', 7000),
          Promise.resolve(host.emit('game:ready')),
          Promise.resolve(guest.emit('game:ready')),
        ]);

        expect(hostCounts).toEqual([3, 2, 1, 0]);
        expect(guestCounts).toEqual([3, 2, 1, 0]);
        expect(hostStart.round).toBe(1);
        expect(guestStart.round).toBe(1);
      },
      10_000,
    );

    it(
      'round:submit 양쪽 제출 → round:result (높은 dB 플레이어가 win)',
      async () => {
        const { host, guest } = await setupRoom(110, 111);
        await startGame(host, guest);

        const [hostResult, guestResult] = await Promise.all([
          waitFor<{
            round: number;
            myDb: number;
            oppDb: number;
            roundResult: string;
            myScore: number;
            oppScore: number;
          }>(host, 'round:result', 3000),
          waitFor<{ roundResult: string; myScore: number }>(guest, 'round:result', 3000),
          Promise.resolve(host.emit('round:submit', { round: 1, peakDb: 95.5 })),
          Promise.resolve(guest.emit('round:submit', { round: 1, peakDb: 80.0 })),
        ]);

        // host가 더 높은 dB → win
        expect(hostResult.round).toBe(1);
        expect(hostResult.myDb).toBe(95.5);
        expect(hostResult.oppDb).toBe(80.0);
        expect(hostResult.roundResult).toBe('win');
        expect(hostResult.myScore).toBe(1);
        expect(hostResult.oppScore).toBe(0);

        // guest 기준
        expect(guestResult.roundResult).toBe('lose');
        expect(guestResult.myScore).toBe(0);
      },
      12_000,
    );

    it(
      'round:submit 동점 → 양쪽 draw, 점수 변화 없음',
      async () => {
        const { host, guest } = await setupRoom(120, 121);
        await startGame(host, guest);

        const [hostResult, guestResult] = await Promise.all([
          waitFor<{ roundResult: string; myScore: number; oppScore: number }>(host, 'round:result', 3000),
          waitFor<{ roundResult: string }>(guest, 'round:result', 3000),
          Promise.resolve(host.emit('round:submit', { round: 1, peakDb: 80 })),
          Promise.resolve(guest.emit('round:submit', { round: 1, peakDb: 80 })),
        ]);

        expect(hostResult.roundResult).toBe('draw');
        expect(guestResult.roundResult).toBe('draw');
        expect(hostResult.myScore).toBe(0);
        expect(hostResult.oppScore).toBe(0);
      },
      12_000,
    );

    it(
      '5.5s 내 미제출 → 서버 hard-close 후 미제출 플레이어 0dB 처리',
      async () => {
        const { host, guest } = await setupRoom(130, 131);
        await startGame(host, guest);

        // host만 제출, guest는 미제출 (서버 5.5s 타이머 대기)
        host.emit('round:submit', { round: 1, peakDb: 70 });

        const [hostResult, guestResult] = await Promise.all([
          waitFor<{ roundResult: string; oppDb: number }>(host, 'round:result', 9000),
          waitFor<{ roundResult: string; myDb: number }>(guest, 'round:result', 9000),
        ]);

        expect(hostResult.roundResult).toBe('win');
        expect(hostResult.oppDb).toBe(0); // guest가 0으로 처리됨
        expect(guestResult.roundResult).toBe('lose');
        expect(guestResult.myDb).toBe(0);
      },
      15_000,
    );

    it(
      '200 초과 peakDb는 200으로 clamp',
      async () => {
        const { host, guest } = await setupRoom(140, 141);
        await startGame(host, guest);

        const [hostResult] = await Promise.all([
          waitFor<{ myDb: number }>(host, 'round:result', 3000),
          waitFor(guest, 'round:result', 3000),
          Promise.resolve(host.emit('round:submit', { round: 1, peakDb: 999 })), // 범위 초과
          Promise.resolve(guest.emit('round:submit', { round: 1, peakDb: 50 })),
        ]);

        expect(hostResult.myDb).toBe(200); // clamp 됨
      },
      12_000,
    );

    it(
      '3라운드 전부 완료 → game:over + DB wins/losses 업데이트',
      async () => {
        const { host, guest } = await setupRoom(150, 151);

        const hostGameOvers: unknown[] = [];
        const guestGameOvers: unknown[] = [];
        host.on('game:over', d => hostGameOvers.push(d));
        guest.on('game:over', d => guestGameOvers.push(d));

        // 라운드 시작을 기다렸다가 제출하는 루프 (host가 항상 이김)
        const submitRound = async (round: number) => {
          await Promise.all([
            waitFor(host, 'round:start', 7000),
            waitFor(guest, 'round:start', 7000),
          ]);
          host.emit('round:submit', { round, peakDb: 95 });
          guest.emit('round:submit', { round, peakDb: 60 });
          await Promise.all([
            waitFor(host, 'round:result', 3000),
            waitFor(guest, 'round:result', 3000),
          ]);
        };

        // 게임 시작
        host.emit('game:ready');
        guest.emit('game:ready');

        await submitRound(1);
        await submitRound(2);
        await submitRound(3);

        // game:over 대기 (round:result 후 1.5s 뒤 emit)
        await Promise.all([
          waitFor(host, 'game:over', 4000),
          waitFor(guest, 'game:over', 4000),
        ]);

        expect(hostGameOvers).toHaveLength(1);
        expect(guestGameOvers).toHaveLength(1);

        const hostFinal = hostGameOvers[0] as {
          result: string;
          myScore: number;
          oppScore: number;
          rounds: unknown[];
        };
        const guestFinal = guestGameOvers[0] as { result: string };

        expect(hostFinal.result).toBe('win');
        expect(hostFinal.myScore).toBe(3);
        expect(hostFinal.oppScore).toBe(0);
        expect(hostFinal.rounds).toHaveLength(3);
        expect(guestFinal.result).toBe('lose');

        // DB 업데이트 검증
        expect(mockUserRepo.incrementWins).toHaveBeenCalledWith(150);
        expect(mockUserRepo.incrementLosses).toHaveBeenCalledWith(151);
      },
      40_000,
    );

    it(
      '무승부 게임(점수 동점) → game:over result: draw, DB 업데이트 없음',
      async () => {
        const { host, guest } = await setupRoom(160, 161);

        // 라운드별: host win, guest win, draw → 1:1:0 → 무승부
        const submitRound = async (round: number, hostDb: number, guestDb: number) => {
          await Promise.all([
            waitFor(host, 'round:start', 7000),
            waitFor(guest, 'round:start', 7000),
          ]);
          host.emit('round:submit', { round, peakDb: hostDb });
          guest.emit('round:submit', { round, peakDb: guestDb });
          await Promise.all([waitFor(host, 'round:result', 3000), waitFor(guest, 'round:result', 3000)]);
        };

        host.emit('game:ready');
        guest.emit('game:ready');

        await submitRound(1, 90, 70); // host win
        await submitRound(2, 70, 90); // guest win
        await submitRound(3, 80, 80); // draw

        const [hostOver, guestOver] = await Promise.all([
          waitFor<{ result: string }>(host, 'game:over', 4000),
          waitFor<{ result: string }>(guest, 'game:over', 4000),
        ]);

        expect(hostOver.result).toBe('draw');
        expect(guestOver.result).toBe('draw');
        // 무승부 → DB 변경 없음
        expect(mockUserRepo.incrementWins).not.toHaveBeenCalled();
        expect(mockUserRepo.incrementLosses).not.toHaveBeenCalled();
      },
      40_000,
    );
  });

  /* ═══════════════════════════════════════════════════════════════
   * 5. Disconnect / Forfeit  (실제 5s 타이머 → 느림)
   * ═══════════════════════════════════════════════════════════════ */
  describe('Disconnect handling', () => {
    beforeEach(() => {
      mockUserRepo.findProfileByUserId.mockImplementation((id: number) =>
        Promise.resolve(fakeProfile(`user-${id}`)),
      );
    });

    it(
      'waiting 상태 disconnect → 방 삭제 (join 불가)',
      async () => {
        const host = await connect(200, '호스트');

        const { roomCode } = await new Promise<{ roomCode: string }>(resolve => {
          host.once('room:created', resolve);
          host.emit('room:create');
        });

        // host가 나감
        await new Promise<void>(resolve => { host.once('disconnect', () => resolve()); host.disconnect(); });
        await delay(300); // 서버 정리 대기

        // 다른 소켓이 join 시도
        const stranger = await connect(201, '낯선이');
        const err = await new Promise<{ message: string }>(resolve => {
          stranger.once('error', resolve);
          stranger.emit('room:join', { roomCode });
        });

        expect(err.message).toBe('존재하지 않는 방 코드입니다.');
      },
    );

    it(
      '게임 중 disconnect → 상대방에게 opponent:disconnected { waitSecs: 5 }',
      async () => {
        const { host, guest } = await setupRoom(210, 211);

        await Promise.all([
          waitFor(host, 'round:start', 7000),
          waitFor(guest, 'round:start', 7000),
          Promise.resolve(host.emit('game:ready')),
          Promise.resolve(guest.emit('game:ready')),
        ]);

        const noticePromise = waitFor<{ waitSecs: number }>(host, 'opponent:disconnected', 3000);
        guest.disconnect();

        const notice = await noticePromise;
        expect(notice.waitSecs).toBe(5);
      },
      15_000,
    );

    it(
      '5초 대기 후 forfeit → 남은 플레이어에게 game:over { result: win, forfeit: true }',
      async () => {
        const { host, guest } = await setupRoom(220, 221);

        await Promise.all([
          waitFor(host, 'round:start', 7000),
          waitFor(guest, 'round:start', 7000),
          Promise.resolve(host.emit('game:ready')),
          Promise.resolve(guest.emit('game:ready')),
        ]);

        guest.disconnect();

        // 5초 타이머 + 여유
        const gameOver = await waitFor<{
          result: string;
          forfeit: boolean;
        }>(host, 'game:over', 8000);

        expect(gameOver.result).toBe('win');
        expect(gameOver.forfeit).toBe(true);
        expect(mockUserRepo.incrementWins).toHaveBeenCalledWith(220);
        expect(mockUserRepo.incrementLosses).toHaveBeenCalledWith(221);
      },
      15_000,
    );

    it(
      '5초 이내 재연결 → forfeit 취소, opponent:reconnected 전달',
      async () => {
        const { host, guest } = await setupRoom(230, 231);

        await Promise.all([
          waitFor(host, 'round:start', 7000),
          waitFor(guest, 'round:start', 7000),
          Promise.resolve(host.emit('game:ready')),
          Promise.resolve(guest.emit('game:ready')),
        ]);

        // guest 연결 끊김
        guest.disconnect();
        await waitFor(host, 'opponent:disconnected', 3000);

        // 3초 내 재연결 (5초 타이머 만료 전)
        await delay(1000);

        // 중요: autoConnect: false 로 소켓을 생성한 뒤
        // 리스너를 먼저 등록하고 나서 connect() 호출.
        // server의 handleConnection → tryReconnect → emit('room:reconnected') 이
        // 클라이언트의 'connect' 이벤트 직후에 도달하므로,
        // waitFor 리스너가 없으면 이벤트를 놓칠 수 있음.
        const token2 = jwtService.sign({ sub: 231, nickname: 'user-231' }, { expiresIn: '15m' });
        const reconnectedSocket = io(`http://localhost:${port}/game`, {
          auth: { token: token2 },
          transports: ['websocket'],
          reconnection: false,
          autoConnect: false,
        });
        activeSockets.add(reconnectedSocket);

        // 연결 전에 리스너 먼저 등록
        const reconnectedDataPromise = waitFor(reconnectedSocket, 'room:reconnected', 5000);
        const hostNoticePromise = waitFor(host, 'opponent:reconnected', 5000);

        reconnectedSocket.connect();
        await new Promise<void>((resolve, reject) => {
          reconnectedSocket.once('connect', resolve);
          reconnectedSocket.once('connect_error', reject);
        });

        await Promise.all([hostNoticePromise, reconnectedDataPromise]);

        const hostNotice = undefined; // opponent:reconnected는 payload 없이 emit됨

        // forfeit 타이머가 취소됐으므로 game:over가 와서는 안 됨 (1.5초 관찰)
        let receivedGameOver = false;
        host.once('game:over', () => { receivedGameOver = true; });
        await delay(1500);
        expect(receivedGameOver).toBe(false);
      },
      15_000,
    );
  });
});
