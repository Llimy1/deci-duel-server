import {
  getActorType,
  getAdminRole,
  getContextUserId,
  getRequestContext,
  getRequestId,
  requestContextStorage,
  setContextAdmin,
  setContextUserId,
} from './request-context';

describe('request-context — AsyncLocalStorage 헬퍼', () => {
  it('컨텍스트 밖에서는 모두 undefined를 반환한다', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getRequestId()).toBeUndefined();
    expect(getContextUserId()).toBeUndefined();
  });

  it('컨텍스트 안에서는 store 값을 그대로 노출한다', () => {
    requestContextStorage.run({ requestId: 'req_1', ip: '1.1.1.1' }, () => {
      expect(getRequestContext()).toMatchObject({ requestId: 'req_1', ip: '1.1.1.1' });
      expect(getRequestId()).toBe('req_1');
    });
  });

  it('setContextUserId로 진행 중인 요청 컨텍스트의 userId를 채울 수 있다 (예: JWT 인증 후)', () => {
    requestContextStorage.run({ requestId: 'req_2' }, () => {
      expect(getContextUserId()).toBeUndefined();
      setContextUserId(123);
      expect(getContextUserId()).toBe(123);
      expect(getRequestContext()).toMatchObject({ requestId: 'req_2', userId: 123 });
    });
  });

  it('setContextUserId는 actorType도 "user"로 채운다 (일반 유저 인증 표시)', () => {
    requestContextStorage.run({ requestId: 'req_user' }, () => {
      expect(getActorType()).toBeUndefined();
      setContextUserId(456);
      expect(getActorType()).toBe('user');
      expect(getAdminRole()).toBeUndefined();
      expect(getRequestContext()).toMatchObject({
        requestId: 'req_user',
        userId: 456,
        actorType: 'user',
      });
    });
  });

  it('setContextUserId는 컨텍스트가 없으면 아무 일도 하지 않는다 (throw 없음)', () => {
    expect(() => setContextUserId(999)).not.toThrow();
    expect(getContextUserId()).toBeUndefined();
  });

  it('setContextAdmin으로 진행 중인 요청 컨텍스트에 actorType="admin"/adminRole을 채울 수 있다', () => {
    requestContextStorage.run({ requestId: 'req_admin' }, () => {
      expect(getActorType()).toBeUndefined();
      expect(getAdminRole()).toBeUndefined();
      setContextAdmin('owner');
      expect(getActorType()).toBe('admin');
      expect(getAdminRole()).toBe('owner');
      expect(getContextUserId()).toBeUndefined();
      expect(getRequestContext()).toMatchObject({
        requestId: 'req_admin',
        actorType: 'admin',
        adminRole: 'owner',
      });
    });
  });

  it('setContextAdmin은 컨텍스트가 없으면 아무 일도 하지 않는다 (throw 없음)', () => {
    expect(() => setContextAdmin('owner')).not.toThrow();
    expect(getActorType()).toBeUndefined();
    expect(getAdminRole()).toBeUndefined();
  });

  it('getActorType/getAdminRole은 컨텍스트 밖에서는 undefined를 반환한다', () => {
    expect(getActorType()).toBeUndefined();
    expect(getAdminRole()).toBeUndefined();
  });

  it('중첩되거나 연속된 run 호출은 서로의 store를 침범하지 않는다', () => {
    const seen: Array<string | undefined> = [];

    requestContextStorage.run({ requestId: 'outer' }, () => {
      seen.push(getRequestId());
      requestContextStorage.run({ requestId: 'inner' }, () => {
        seen.push(getRequestId());
      });
      seen.push(getRequestId());
    });
    seen.push(getRequestId());

    expect(seen).toEqual(['outer', 'inner', 'outer', undefined]);
  });

  it('비동기 흐름에서도 컨텍스트가 유지된다', async () => {
    await requestContextStorage.run({ requestId: 'async_req' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(getRequestId()).toBe('async_req');
    });
  });
});
