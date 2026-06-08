import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../logger/app-logger.service';
import { getRequestId } from '../context/request-context';
import { sanitizeMetadata } from './sanitize-metadata';
import type {
  OperationalEventFilter,
  RecordOperationalEventInput,
} from './operational-event.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * 관리자에게 의미 있는 운영 이벤트만 DB에 저장한다 (모든 HTTP raw 로그 저장 금지).
 *
 * 중요: `record()`는 절대 throw하지 않는다 — 저장 실패가 원 요청을 깨뜨리면 안 되므로
 * 내부에서 catch 후 로그만 남긴다 (`AGENTS.md`/Codex 지시 핵심 제약).
 */
@Injectable()
export class OperationalEventService {
  private readonly logger = new AppLogger();

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordOperationalEventInput): Promise<void> {
    try {
      await this.prisma.operationalEvent.create({
        data: {
          level: input.level,
          category: input.category,
          event: input.event,
          message: input.message ?? null,
          userId: input.userId ?? null,
          requestId: input.requestId ?? getRequestId() ?? null,
          roomCode: input.roomCode ?? null,
          metadata: (sanitizeMetadata(input.metadata) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        `OperationalEvent 저장 실패 [${input.category}/${input.event}]`,
        err instanceof Error ? err.stack : String(err),
        'OperationalEventService',
      );
    }
  }

  async findMany(filter: OperationalEventFilter): Promise<{
    items: Awaited<ReturnType<PrismaService['operationalEvent']['findMany']>>;
    nextCursor: number | null;
    hasMore: boolean;
  }> {
    const limit = clampLimit(filter.limit);

    const where: Prisma.OperationalEventWhereInput = {
      ...(filter.level ? { level: filter.level } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.event ? { event: filter.event } : {}),
      ...(filter.userId !== undefined ? { userId: filter.userId } : {}),
      ...(filter.requestId ? { requestId: filter.requestId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };

    const items = await this.prisma.operationalEvent.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      take: limit + 1,
      ...(filter.cursor !== undefined ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    return { items: sliced, nextCursor, hasMore };
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}
