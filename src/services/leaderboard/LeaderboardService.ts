import type { LeaderboardEntry } from '../../app/types';

export interface LeaderboardService {
  getTopEntries(game: string, limit: number): Promise<LeaderboardEntry[]>;
  submitEntry(input: {
    game: string;
    name: string;
    score: number;
    timeSeconds?: number | null;
    trackId?: string | null;
    trackLabel?: string | null;
  }): Promise<LeaderboardEntry[]>;
}
