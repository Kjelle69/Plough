import { GameRuntime } from '../game/core/GameRuntime';
import { createMockLeaderboardService } from '../services/leaderboard/MockLeaderboardService';
import { PlayerProfileStore } from '../state/PlayerProfileStore';
import type { AppView, LeaderboardEntry } from './types';

export class App {
  private readonly root: HTMLElement;
  private readonly devMode = new URLSearchParams(window.location.search).get('dev') === '1';

  private currentView: AppView = 'menu';

  private readonly leaderboardService = createMockLeaderboardService();

  private readonly playerProfileStore = new PlayerProfileStore();

  private gameRuntime: GameRuntime | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  mount(): void {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = '';
    this.root.dataset.view = this.currentView;

    if (this.currentView === 'menu') {
      this.renderMenu();
      return;
    }

    this.renderGame();
  }

  private renderMenu(): void {
    const shell = document.createElement('main');
    shell.className = 'menu-shell';

    shell.innerHTML = `
      <section class="menu-hero">
        <div class="title-group">
          <p class="eyebrow">Single-player prototype</p>
          <h1>Plough</h1>
          <p class="hero-copy">
            A clean early build for the future snow-plowing game. Configure your pilot profile,
            review the local leaderboard, and jump into the placeholder 3D scene.
          </p>
        </div>
        <div class="hero-actions">
          <button id="start-btn" class="primary-button" type="button">Start Game</button>
          <p class="hero-note">This iteration uses mocked leaderboard data and local profile storage.</p>
        </div>
      </section>
      <section class="menu-grid">
        <div class="panel profile-panel">
          <div class="panel-heading">
            <h2>Driver Profile</h2>
            <span class="panel-tag">Local</span>
          </div>
          <label class="field">
            <span>Player name</span>
            <input id="player-name-input" name="playerName" type="text" maxlength="20" placeholder="Enter your driver name" />
          </label>
          <div class="placeholder-block">
            <h3>Login / Profile</h3>
            <p>Placeholder only. Future account and cloud profile integration will live here.</p>
          </div>
        </div>
        <div class="panel options-panel">
          <div class="panel-heading">
            <h2>Run Setup</h2>
            <span class="panel-tag">Future</span>
          </div>
          <div class="placeholder-grid">
            <div class="placeholder-card">
              <h3>Difficulty</h3>
              <p>Casual, standard, and hardcore presets will be added in a later iteration.</p>
            </div>
            <div class="placeholder-card">
              <h3>Vehicle / Plow</h3>
              <p>Machine selection UI placeholder. Real stats and unlocks are intentionally deferred.</p>
            </div>
          </div>
        </div>
        <div class="panel leaderboard-panel">
          <div class="panel-heading">
            <h2>Top 10 Leaderboard</h2>
            <span class="panel-tag">Mocked</span>
          </div>
          <div id="leaderboard-status" class="leaderboard-status">Loading leaderboard...</div>
          <ol id="leaderboard-list" class="leaderboard-list" aria-live="polite"></ol>
        </div>
      </section>
    `;

    this.root.append(shell);

    const input = shell.querySelector<HTMLInputElement>('#player-name-input');
    const startButton = shell.querySelector<HTMLButtonElement>('#start-btn');

    if (!input || !startButton) {
      throw new Error('Menu controls failed to render.');
    }

    input.value = this.playerProfileStore.getPlayerName();
    input.addEventListener('input', () => {
      this.playerProfileStore.setPlayerName(input.value);
    });

    startButton.addEventListener('click', () => {
      this.currentView = 'game';
      this.render();
    });

    void this.populateLeaderboard(shell);
  }

  private async populateLeaderboard(shell: HTMLElement): Promise<void> {
    const status = shell.querySelector<HTMLElement>('#leaderboard-status');
    const list = shell.querySelector<HTMLOListElement>('#leaderboard-list');

    if (!status || !list) {
      return;
    }

    try {
      const entries = await this.leaderboardService.getTopEntries(10);
      status.textContent = 'Local prototype standings';
      list.replaceChildren(...entries.map((entry) => this.renderLeaderboardItem(entry)));
    } catch (error) {
      console.error('Failed to load leaderboard', error);
      status.textContent = 'Leaderboard unavailable.';
      list.replaceChildren();
    }
  }

  private renderLeaderboardItem(entry: LeaderboardEntry): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';
    item.innerHTML = `
      <span class="leaderboard-rank">${entry.rank}</span>
      <span class="leaderboard-name">${entry.playerName}</span>
      <span class="leaderboard-score">${entry.score.toLocaleString()} pts</span>
    `;
    return item;
  }

  private renderGame(): void {
    const shell = document.createElement('section');
    shell.className = 'game-shell';
    shell.innerHTML = `
      <header class="game-header">
        <div>
          <p class="eyebrow">Prototype scene</p>
          <h2>Plough Map</h2>
        </div>
        <div class="game-header-actions">
          <p class="game-help">Clear the snow across the imported plough map. Drive with left stick / triggers on XBOX controller or WASD / arrows on keyboard. Angle the plow with <kbd>Q</kbd>/<kbd>E</kbd> or LB/RB, raise and lower it with <kbd>Z</kbd>/<kbd>X</kbd> or D-pad up/down. Press <kbd>F</kbd> for fullscreen and <kbd>R</kbd> to restart a run.</p>
          <button id="return-to-menu" class="secondary-button" type="button">Return to Menu</button>
        </div>
      </header>
      <div id="game-stage" class="game-stage"></div>
    `;

    this.root.append(shell);

    const stage = shell.querySelector<HTMLElement>('#game-stage');
    const backButton = shell.querySelector<HTMLButtonElement>('#return-to-menu');

    if (!stage || !backButton) {
      throw new Error('Game view failed to render.');
    }

    this.gameRuntime = new GameRuntime({
      mountPoint: stage,
      playerName: this.playerProfileStore.getPlayerName(),
      devMode: this.devMode,
      onExitToMenu: () => {
        this.gameRuntime?.dispose();
        this.gameRuntime = null;
        this.currentView = 'menu';
        this.render();
      },
    });
    void this.gameRuntime.mount();

    backButton.addEventListener('click', () => {
      this.gameRuntime?.dispose();
      this.gameRuntime = null;
      this.currentView = 'menu';
      this.render();
    });
  }
}
