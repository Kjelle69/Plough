const PLAYER_NAME_STORAGE_KEY = 'plough.playerName';
const DEFAULT_PLAYER_NAME = 'Guest Driver';

export class PlayerProfileStore {
  getPlayerName(): string {
    const storedValue = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim();
    return storedValue && storedValue.length > 0 ? storedValue : DEFAULT_PLAYER_NAME;
  }

  setPlayerName(playerName: string): void {
    const normalizedName = playerName.trim();

    if (normalizedName.length === 0) {
      window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, normalizedName);
  }
}
