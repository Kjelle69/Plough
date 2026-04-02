import type { LeaderboardEntry } from '../../app/types';

export interface LeaderboardService {
  getTopEntries(limit: number): Promise<LeaderboardEntry[]>;
}
