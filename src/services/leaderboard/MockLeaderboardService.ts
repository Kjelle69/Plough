import type { LeaderboardEntry } from '../../app/types';
import type { LeaderboardService } from './LeaderboardService';

const DEFAULT_MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, playerName: 'Freja', score: 12450, timeSeconds: 81 },
  { rank: 2, playerName: 'Mikael', score: 11890, timeSeconds: 93 },
  { rank: 3, playerName: 'Aino', score: 11020, timeSeconds: 99 },
  { rank: 4, playerName: 'Hugo', score: 10410, timeSeconds: 106 },
  { rank: 5, playerName: 'Sofia', score: 9980, timeSeconds: 111 },
  { rank: 6, playerName: 'Emil', score: 9610, timeSeconds: 118 },
  { rank: 7, playerName: 'Noor', score: 9250, timeSeconds: 124 },
  { rank: 8, playerName: 'Levi', score: 9010, timeSeconds: 129 },
  { rank: 9, playerName: 'Ida', score: 8790, timeSeconds: 133 },
  { rank: 10, playerName: 'Vilgot', score: 8420, timeSeconds: 140 },
];

export function createMockLeaderboardService(): LeaderboardService {
  const boards = new Map<string, LeaderboardEntry[]>();

  const ensureBoard = (game: string): LeaderboardEntry[] => {
    const existing = boards.get(game);
    if (existing) {
      return existing;
    }

    const seeded = DEFAULT_MOCK_LEADERBOARD.map((entry) => ({ ...entry }));
    boards.set(game, seeded);
    return seeded;
  };

  return {
    async getTopEntries(game: string, limit: number): Promise<LeaderboardEntry[]> {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      return ensureBoard(game)
        .slice(0, limit)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
    },
    async submitEntry(input): Promise<LeaderboardEntry[]> {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      const board = ensureBoard(input.game);
      board.push({
        rank: board.length + 1,
        playerName: input.name,
        score: input.score,
        timeSeconds: input.timeSeconds ?? null,
        createdAt: new Date().toISOString(),
      });
      board.sort((a, b) => b.score - a.score || (a.timeSeconds ?? Number.POSITIVE_INFINITY) - (b.timeSeconds ?? Number.POSITIVE_INFINITY));
      board.splice(10);
      return board.map((entry, index) => ({ ...entry, rank: index + 1 }));
    },
  };
}
