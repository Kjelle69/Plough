export type AppView = 'menu' | 'game' | 'editor';

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
}
