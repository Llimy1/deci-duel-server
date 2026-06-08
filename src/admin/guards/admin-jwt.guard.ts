import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { setContextAdmin } from '../../common/context/request-context';

/**
 * 일반 유저 JwtAuthGuard와 분리된 admin 전용 guard. AdminJwtStrategy('admin-jwt')를 사용한다.
 * 인증 성공 시 request context에 `actorType: 'admin'`/`adminRole`을 반영해
 * 구조화 로그/`OperationalEvent`에서 admin 요청을 일반 유저 요청과 구분 추적할 수 있게 한다.
 */
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {
  handleRequest<TUser = { role: string }>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const result = super.handleRequest(err, user, info, context, status) as TUser;
    const role = (result as unknown as { role?: unknown })?.role;
    if (typeof role === 'string') {
      setContextAdmin(role);
    }
    return result;
  }
}
