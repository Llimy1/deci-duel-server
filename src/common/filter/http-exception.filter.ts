import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiResponse } from '../dto/api-response.dto';
import { AppLogger } from '../logger/app-logger.service';
import { getRequestId } from '../context/request-context';

function extractMessage(exception: HttpException): string {
  const exceptionResponse = exception.getResponse();
  if (
    exceptionResponse !== null &&
    typeof exceptionResponse === 'object' &&
    'message' in exceptionResponse
  ) {
    const msg = (exceptionResponse as Record<string, unknown>).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return exception.message;
}

/**
 * 4xx/5xx 모두 requestId를 응답 본문에 포함하고, 레벨을 분리해 로그를 남긴다.
 * - 4xx: warn (클라이언트 오류 — 운영상 노이즈가 크므로 stack 없이)
 * - 5xx: error + stack
 */
function logHttpException(logger: AppLogger, exception: HttpException, status: number, message: string) {
  const requestId = getRequestId();
  const logMessage = `[${requestId ?? '-'}] ${exception.constructor.name} ${status} ${message}`;
  if (status >= 500) {
    logger.error(logMessage, exception.stack, 'HttpExceptionFilter');
  } else if (status >= 400) {
    logger.warn(logMessage, 'HttpExceptionFilter');
  } else {
    logger.log(logMessage, 'HttpExceptionFilter');
  }
}

/** HttpException → 기존과 동일한 포맷 + requestId 포함으로 응답 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new AppLogger();

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception.getStatus();
    const message = extractMessage(exception);

    logHttpException(this.logger, exception, status, message);

    response.status(status).json(new ApiResponse(status, message, null));
  }
}

/**
 * 모든 예외를 잡는 전역 fallback 필터.
 * - Prisma 에러 → 의미 있는 HTTP 상태코드로 변환
 * - 나머지 알 수 없는 에러 → 500 Internal Server Error
 *
 * 모든 분기에서 requestId를 로그/응답 본문에 포함한다.
 * 4xx는 warn, 5xx/unknown은 error + stack.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new AppLogger();

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const requestId = getRequestId();

    // 이미 HttpException이면 HttpExceptionFilter가 먼저 처리했어야 하지만,
    // 글로벌 필터 등록 순서에 따라 여기 올 수도 있으므로 방어 처리
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = extractMessage(exception);
      logHttpException(this.logger, exception, status, message);
      return response.status(status).json(new ApiResponse(status, message, null));
    }

    // Prisma Known Request Error (P2002, P2025 등)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, message } = resolvePrismaError(exception);
      this.logger.warn(
        `[${requestId ?? '-'}] Prisma ${exception.code}: ${exception.message}`,
        'AllExceptionsFilter',
      );
      return response.status(status).json(new ApiResponse(status, message, null));
    }

    // Prisma Validation Error (잘못된 쿼리 인자 등)
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(
        `[${requestId ?? '-'}] Prisma validation error: ${exception.message}`,
        'AllExceptionsFilter',
      );
      return response
        .status(HttpStatus.BAD_REQUEST)
        .json(new ApiResponse(HttpStatus.BAD_REQUEST, '잘못된 요청입니다.', null));
    }

    // 그 외 모든 에러 → 500 + stack
    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(
      `[${requestId ?? '-'}] Unhandled exception`,
      stack,
      'AllExceptionsFilter',
    );
    return response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(new ApiResponse(HttpStatus.INTERNAL_SERVER_ERROR, '서버 오류가 발생했습니다.', null));
  }
}

function resolvePrismaError(err: Prisma.PrismaClientKnownRequestError): {
  status: number;
  message: string;
} {
  switch (err.code) {
    case 'P2002':
      // 유니크 제약 위반
      return { status: HttpStatus.CONFLICT, message: '이미 존재하는 데이터입니다.' };
    case 'P2025':
      // 레코드를 찾을 수 없음 (update/delete 대상 없음)
      return { status: HttpStatus.NOT_FOUND, message: '데이터를 찾을 수 없습니다.' };
    case 'P2003':
      // 외래키 제약 위반
      return { status: HttpStatus.BAD_REQUEST, message: '참조된 데이터가 존재하지 않습니다.' };
    case 'P2014':
      // 관계 위반
      return { status: HttpStatus.BAD_REQUEST, message: '잘못된 데이터 관계입니다.' };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: '데이터베이스 오류가 발생했습니다.' };
  }
}
