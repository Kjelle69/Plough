export type AppView = 'menu' | 'game' | 'editor';

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
  createdAt?: string;
  timeSeconds?: number | null;
}

export interface RunResultViewModel {
  playerName: string;
  worldComboId: string;
  worldLabel: string;
  score: number;
  baseScore: number;
  speedBonus: number;
  penalties: number;
  pinMisses: number;
  elapsedSeconds: number;
  clearedPercent: number;
  leaderboard: LeaderboardEntry[];
}
