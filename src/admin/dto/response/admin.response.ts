export class AdminLoginResponse {
  constructor(
    public readonly accessToken: string,
    public readonly expiresIn: number,
  ) {}
}

export interface AdminHealthResponse {
  ok: boolean;
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  nodeEnv: string;
  serverVersion: string;
  db: {
    status: 'ok' | 'error';
    latencyMs?: number;
  };
  game: {
    roomCount: number;
    connectedSocketCount: number;
    activePlayerCount: number;
  };
}

export interface AdminEventItem {
  id: number;
  level: string;
  category: string;
  event: string;
  message: string | null;
  userId: number | null;
  requestId: string | null;
  roomCode: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AdminEventsResponse {
  items: AdminEventItem[];
  nextCursor: number | null;
  hasMore: boolean;
}
