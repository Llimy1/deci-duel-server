import { getRequestId } from '../context/request-context';

/**
 * 공통 API 응답 포맷.
 *
 * `requestId`는 4번째 인자로 명시하지 않으면 현재 요청 컨텍스트(AsyncLocalStorage)에서
 * 자동으로 채워진다 — 기존 `new ApiResponse(status, message, data)` 호출부를
 * 전혀 수정하지 않아도 모든 응답에 requestId가 실린다 (앱 파서와의 호환을 위해
 * optional 필드로 추가했으며, 값이 없으면 직렬화 시 생략된다).
 */
export class ApiResponse<T> {
  public readonly requestId?: string;

  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly data: T,
    requestId?: string,
  ) {
    this.requestId = requestId ?? getRequestId();
  }
}
