export interface AuthRequest extends Request {
  user: { userId: number; nickname: string };
}
