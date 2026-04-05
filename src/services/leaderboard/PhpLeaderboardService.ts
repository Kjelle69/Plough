import type { LeaderboardEntry } from '../../app/types';
import type { LeaderboardService } from './LeaderboardService';
import { createMockLeaderboardService } from './MockLeaderboardService';

interface HighscoreApiRow {
  player_name: string;
  score: number;
  created_at?: string;
  metric1_value?: number | null;
  metric1_unit?: string | null;
  metric1_label?: string | null;
  metric2_value?: string | number | null;
  metric2_unit?: string | null;
  metric2_label?: string | null;
}

interface HighscoreApiResponse {
  ok: boolean;
  game: string;
  top: HighscoreApiRow[];
}

const DEFAULT_ENDPOINT = 'https://mtecproductions.se/api/highscores.php';

export function createPhpLeaderboardService(endpoint = DEFAULT_ENDPOINT): LeaderboardService {
  const fallback = createMockLeaderboardService();

  const normalizeEntries = (rows: HighscoreApiRow[], limit: number): LeaderboardEntry[] =>
    rows.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      playerName: row.player_name,
      score: row.score,
      createdAt: row.created_at,
      timeSeconds: row.metric1_label === 'Time' ? (row.metric1_value ?? null) : null,
    }));

  return {
    async getTopEntries(game: string, limit: number): Promise<LeaderboardEntry[]> {
      try {
        const url = new URL(endpoint);
        url.searchParams.set('game', game);
        const response = await fetch(url.toString(), { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Leaderboard GET failed: ${response.status}`);
        }

        const payload = (await response.json()) as HighscoreApiResponse;
        if (!payload.ok || !Array.isArray(payload.top)) {
          throw new Error('Leaderboard GET payload invalid');
        }

        return normalizeEntries(payload.top, limit);
      } catch (error) {
        console.warn('Falling back to mock leaderboard data', error);
        return fallback.getTopEntries(game, limit);
      }
    },
    async submitEntry(input): Promise<LeaderboardEntry[]> {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            game: input.game,
            name: input.name,
            score: input.score,
            metric1_value: input.timeSeconds != null ? Math.round(input.timeSeconds) : null,
            metric1_unit: input.timeSeconds != null ? 's' : null,
            metric1_label: input.timeSeconds != null ? 'Time' : null,
            metric2_value: input.trackId ?? input.trackLabel ?? null,
            metric2_unit: null,
            metric2_label: input.trackLabel ? 'Track' : null,
          }),
        });
        if (!response.ok) {
          throw new Error(`Leaderboard POST failed: ${response.status}`);
        }

        const payload = (await response.json()) as HighscoreApiResponse;
        if (!payload.ok || !Array.isArray(payload.top)) {
          throw new Error('Leaderboard POST payload invalid');
        }

        return normalizeEntries(payload.top, 10);
      } catch (error) {
        console.warn('Falling back to mock leaderboard submission', error);
        return fallback.submitEntry(input);
      }
    },
  };
}
