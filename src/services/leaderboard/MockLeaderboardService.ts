import type { LeaderboardEntry } from '../../app/types';
import type { LeaderboardService } from './LeaderboardService';

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, playerName: 'Freja', score: 12450 },
  { rank: 2, playerName: 'Mikael', score: 11890 },
  { rank: 3, playerName: 'Aino', score: 11020 },
  { rank: 4, playerName: 'Hugo', score: 10410 },
  { rank: 5, playerName: 'Sofia', score: 9980 },
  { rank: 6, playerName: 'Emil', score: 9610 },
  { rank: 7, playerName: 'Noor', score: 9250 },
  { rank: 8, playerName: 'Levi', score: 9010 },
  { rank: 9, playerName: 'Ida', score: 8790 },
  { rank: 10, playerName: 'Vilgot', score: 8420 },
];

export function createMockLeaderboardService(): LeaderboardService {
  return {
    async getTopEntries(limit: number): Promise<LeaderboardEntry[]> {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      return MOCK_LEADERBOARD.slice(0, limit);
    },
  };
}
