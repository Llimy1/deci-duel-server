import { Injectable } from '@nestjs/common';
import { LeaderboardRepository, LeaderboardEntryRaw } from './leaderboard.repository';
import { LeaderboardEntryResponse, GlobalLeaderboardResponse } from './dto/response/leaderboard.response';
import { R2StorageService } from '../storage/r2-storage.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly leaderboardRepository: LeaderboardRepository,
    private readonly r2StorageService: R2StorageService,
  ) {}

  async getGlobalLeaderboard(userId: number): Promise<GlobalLeaderboardResponse> {
    const [rawEntries, rawMyEntry] = await Promise.all([
      this.leaderboardRepository.getTopEntries(),
      this.leaderboardRepository.getMyEntry(userId),
    ]);

    // 모든 항목의 profileImageKey → signed URL 병렬 변환
    const allRaw: LeaderboardEntryRaw[] = rawMyEntry
      ? [...rawEntries, rawMyEntry]
      : rawEntries;

    const urlMap = await this.buildUrlMap(allRaw);

    const entries = rawEntries.map((r) => this.toResponse(r, urlMap));
    const myEntry = rawMyEntry ? this.toResponse(rawMyEntry, urlMap) : null;

    return new GlobalLeaderboardResponse(entries, myEntry);
  }

  private async buildUrlMap(raws: LeaderboardEntryRaw[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const keys = [...new Set(raws.map((r) => r.profileImageKey).filter((k): k is string => k !== null))];

    await Promise.all(
      keys.map(async (key) => {
        try {
          const url = await this.r2StorageService.getSignedDownloadUrl(key);
          map.set(key, url);
        } catch {
          // signed URL 실패 시 해당 항목은 null로 처리
        }
      }),
    );

    return map;
  }

  private toResponse(raw: LeaderboardEntryRaw, urlMap: Map<string, string>): LeaderboardEntryResponse {
    const profileImageUrl = raw.profileImageKey ? (urlMap.get(raw.profileImageKey) ?? null) : null;
    return new LeaderboardEntryResponse(
      raw.rank,
      raw.userId,
      raw.nickname,
      raw.avatarColor,
      raw.bestDb,
      profileImageUrl,
    );
  }
}
