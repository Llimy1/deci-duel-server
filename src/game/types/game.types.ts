export type GameState =
  | 'waiting'         // room created, waiting for 2nd player
  | 'ready'           // 2 players joined, waiting for both to press ready
  | 'countdown'       // 3-2-1 countdown in progress
  | 'preparing'       // round:prepare sent, waiting for both round:mic-ready
  | 'playing'         // round in progress, accepting submissions
  | 'round_end'       // round resolved, brief pause before next round
  | 'game_over'       // game finished, room kept alive for rematch
  | 'rematch_waiting'; // at least one player requested rematch

export interface PlayerInfo {
  userId: number;
  nickname: string;
  socketId: string;
  avatarColor: string;
  profileImageKey: string | null;
  bestDb: number;
  isHost: boolean;
  isReady: boolean;
  wantsRematch: boolean;
  connected: boolean;
  /** peakDb submitted per round: { [round]: dB } */
  roundSubmissions: Record<number, number>;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoundRecord {
  round: number;
  submissions: Record<number, number>; // userId → peakDb
}

export interface GameRoom {
  roomCode: string;
  /** userId → PlayerInfo */
  players: Map<number, PlayerInfo>;
  state: GameState;
  currentRound: number;
  totalRounds: number;       // fixed: 3
  roundDurationMs: number;   // fixed: 5500 (5.5 s hard close; client uses 5000 ms)
  /** userId → round-win count in this game */
  scores: Map<number, number>;
  roundRecords: RoundRecord[];
  roundTimer: ReturnType<typeof setTimeout> | null;
  /** Per-round mic-ready tracking: userId → round number they sent mic-ready for */
  micReady: Map<number, number>;
  /** Prepare timeout: if not all mic-ready within ROUND_PREPARE_TIMEOUT_MS → forfeit */
  prepareTimer: ReturnType<typeof setTimeout> | null;
  /** TTL timer: auto-cleanup idle rooms after game_over / rematch_waiting */
  ttlTimer: ReturnType<typeof setTimeout> | null;
  /** 첫 round:start를 emit했는지. true이면 공식 대결 성립, 실패 시 forfeit 처리 */
  officialRoundStarted: boolean;
  /** prepare window 만료 시각 (Date.now() 기준 ms). 재연결 시 남은 시간 계산용 */
  prepareDeadlineAt: number | null;
  createdAt: Date;
}
