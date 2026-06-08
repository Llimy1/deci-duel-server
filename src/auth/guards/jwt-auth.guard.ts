import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { setContextUserId } from '../../common/context/request-context';

/**
 * 일반 유저 JWT guard. 인증 성공 시 request context에 `userId`/`actorType: 'user'`를
 * 반영해 구조화 로그/`OperationalEvent`에서 actor를 추적할 수 있게 한다.
 *
 * `handleRequest()`는 Passport가 인증 결과를 확정하는 지점이라 — strategy.validate()
 * 보다 여기서 컨텍스트를 채우는 편이 "guard를 통과한 인증된 요청"이라는 의미가 명확하다.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = { userId: number; nickname: string }>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const result = super.handleRequest(err, user, info, context, status) as TUser;
    const userId = (result as unknown as { userId?: unknown })?.userId;
    if (typeof userId === 'number') {
      setContextUserId(userId);
    }
    return result;
  }
}
