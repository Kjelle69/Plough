import { GameRuntime } from '../game/core/GameRuntime';
import { DEFAULT_WORLD_COMBO_PRESET, WORLD_COMBO_PRESETS, getWorldComboPresetById } from '../game/levels/worldPresets';
import { createPhpLeaderboardService } from '../services/leaderboard/PhpLeaderboardService';
import { PlayerProfileStore } from '../state/PlayerProfileStore';
import type { AppView, LeaderboardEntry, RunResultViewModel } from './types';
import type { RunSnapshot } from '../game/core/types';

export class App {
  private static readonly WORLD_COMBO_STORAGE_KEY = 'plough.selectedWorldCombo';

  private readonly root: HTMLElement;
  private readonly devMode = new URLSearchParams(window.location.search).get('dev') === '1';

  private currentView: AppView = 'menu';

  private readonly leaderboardService = createPhpLeaderboardService();

  private readonly playerProfileStore = new PlayerProfileStore();

  private gameRuntime: GameRuntime | null = null;

  private selectedWorldComboId = this.readSelectedWorldComboId();

  private menuLeaderboardRequestId = 0;

  private resultOverlayRequestId = 0;

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

    if (this.currentView === 'editor') {
      this.renderEditor();
      return;
    }

    this.renderGame();
  }

  private renderMenu(): void {
    const selectedPreset = getWorldComboPresetById(this.selectedWorldComboId);
    const shell = document.createElement('main');
    shell.className = 'menu-shell';

    shell.innerHTML = `
      <section class="menu-hero">
        <div class="title-group">
          <p class="eyebrow">Snow Plowing Game</p>
          <h1>Plough</h1>
          <p class="hero-copy">
            Compete for the best score on different world/plow-area combos.
          </p>
        </div>
        <div class="hero-actions">
          <div class="hero-button-row">
            <button id="start-btn" class="primary-button" type="button">Start Game</button>
            ${this.devMode ? '<button id="edit-btn" class="secondary-button" type="button">Edit</button>' : ''}
          </div>
          <p class="hero-note">v260405b.</p>
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
            <span class="panel-tag">${this.devMode ? 'Configurable' : 'Future'}</span>
          </div>
          <label class="field">
            <span>World / plow area combo</span>
            <select id="world-combo-select" class="menu-select" name="worldCombo">
              ${WORLD_COMBO_PRESETS.map(
                (preset) =>
                  `<option value="${preset.id}" ${preset.id === selectedPreset.id ? 'selected' : ''}>${preset.label}</option>`,
              ).join('')}
            </select>
          </label>
          <div class="placeholder-block combo-block">
            <h3>${selectedPreset.label}</h3>
            <p><strong>World:</strong> ${selectedPreset.worldLabel}</p>
            <p><strong>Plow area:</strong> ${selectedPreset.plowAreaLabel}</p>
            <p>${selectedPreset.description}</p>
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
            <span class="panel-tag">Plough</span>
          </div>
          <p id="menu-leaderboard-status" class="leaderboard-status">Loading Plough standings...</p>
          <ol id="menu-leaderboard-list" class="leaderboard-list" aria-live="polite"></ol>
        </div>
      </section>
    `;

    this.root.append(shell);

    const input = shell.querySelector<HTMLInputElement>('#player-name-input');
    const startButton = shell.querySelector<HTMLButtonElement>('#start-btn');
    const editButton = shell.querySelector<HTMLButtonElement>('#edit-btn');
    const worldComboSelect = shell.querySelector<HTMLSelectElement>('#world-combo-select');
    const leaderboardStatus = shell.querySelector<HTMLElement>('#menu-leaderboard-status');
    const leaderboardList = shell.querySelector<HTMLOListElement>('#menu-leaderboard-list');

    if (!input || !startButton || !worldComboSelect || !leaderboardStatus || !leaderboardList) {
      throw new Error('Menu controls failed to render.');
    }

    input.value = this.playerProfileStore.getPlayerName();
    input.addEventListener('input', () => {
      this.playerProfileStore.setPlayerName(input.value);
    });

    worldComboSelect.addEventListener('change', () => {
      this.selectedWorldComboId = worldComboSelect.value;
      window.localStorage.setItem(App.WORLD_COMBO_STORAGE_KEY, this.selectedWorldComboId);
      this.render();
    });

    void this.populateMenuLeaderboard(
      leaderboardStatus,
      leaderboardList,
      this.getLeaderboardGameKey(),
      'Plough',
    );

    startButton.addEventListener('click', () => {
      this.currentView = 'game';
      this.render();
    });

    editButton?.addEventListener('click', () => {
      this.currentView = 'editor';
      this.render();
    });
  }

  private renderLeaderboardItem(entry: LeaderboardEntry): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';
    item.innerHTML = `
      <span class="leaderboard-rank">${entry.rank}</span>
      <span class="leaderboard-name">${entry.playerName}</span>
      <span class="leaderboard-score">${entry.score.toLocaleString()} pts${entry.timeSeconds != null ? ` · ${entry.timeSeconds}s` : ''}</span>
    `;
    return item;
  }

  private async populateMenuLeaderboard(
    status: HTMLElement,
    list: HTMLOListElement,
    gameKey: string,
    worldLabel: string,
  ): Promise<void> {
    const requestId = ++this.menuLeaderboardRequestId;
    status.textContent = `Loading standings for ${worldLabel}...`;
    list.replaceChildren();

    try {
      const entries = await this.leaderboardService.getTopEntries(gameKey, 10);
      if (requestId !== this.menuLeaderboardRequestId || !status.isConnected || !list.isConnected) {
        return;
      }

      if (entries.length === 0) {
        status.textContent = `No posted runs for ${worldLabel} yet.`;
        return;
      }

      status.textContent = `Live standings for ${worldLabel}`;
      list.replaceChildren(...entries.slice(0, 10).map((entry) => this.renderLeaderboardItem(entry)));
    } catch (error) {
      console.error('Failed to load menu leaderboard', error);
      if (requestId !== this.menuLeaderboardRequestId || !status.isConnected || !list.isConnected) {
        return;
      }
      status.textContent = `Leaderboard unavailable for ${worldLabel}.`;
      list.replaceChildren();
    }
  }

  private renderGame(): void {
    const selectedPreset = getWorldComboPresetById(this.selectedWorldComboId);
    const shell = document.createElement('section');
    shell.className = 'game-shell';
    shell.innerHTML = `
      <header class="game-header">
        <div>
          <p class="eyebrow">Prototype scene</p>
          <h2>${selectedPreset.label}</h2>
        </div>
        <div class="game-header-actions">
          <p class="game-help">Clear the snow across ${selectedPreset.worldLabel}. Drive with left stick / triggers on XBOX controller or WASD / arrows on keyboard. Angle the plow with <kbd>Q</kbd>/<kbd>E</kbd> or LB/RB, raise and lower it with <kbd>Z</kbd>/<kbd>X</kbd> or D-pad up/down. Press <kbd>F</kbd> for fullscreen and <kbd>R</kbd> to restart a run.</p>
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
      mode: 'play',
      worldComboId: selectedPreset.id,
      worldComboLabel: selectedPreset.label,
      onRunComplete: (snapshot) => {
        void this.showRunResult(shell, selectedPreset.id, selectedPreset.label, snapshot);
      },
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

  private renderEditor(): void {
    const selectedPreset = getWorldComboPresetById(this.selectedWorldComboId);
    const shell = document.createElement('section');
    shell.className = 'game-shell';
    shell.innerHTML = `
      <header class="game-header">
        <div>
          <p class="eyebrow">Dev Route Editor</p>
          <h2>${selectedPreset.label}</h2>
        </div>
        <div class="game-header-actions">
          <p class="game-help">Editor mode is only available with <kbd>?dev=1</kbd>. This first pass boots the selected world/plow-area combo in a dedicated editor view so route tools can be layered on next.</p>
          <button id="return-to-menu" class="secondary-button" type="button">Return to Menu</button>
        </div>
      </header>
      <div class="editor-layout">
        <div class="editor-sidebar panel">
          <div class="panel-heading">
            <h2>Route Editor</h2>
            <span class="panel-tag">Scaffold</span>
          </div>
          <div class="placeholder-grid">
            <div class="placeholder-card">
              <h3>Selected combo</h3>
              <p><strong>World:</strong> ${selectedPreset.worldLabel}</p>
              <p><strong>Plow area:</strong> ${selectedPreset.plowAreaLabel}</p>
            </div>
            <div class="placeholder-card">
              <h3>Next editor tools</h3>
              <p>Left click already drops route points on the snow surface. Next up are route width, gate pairs, and export/import polish.</p>
            </div>
          </div>
        </div>
        <div class="editor-stage-wrap">
          <div id="editor-stage" class="game-stage"></div>
          <div class="editor-stage-overlay">
            <strong>Editor bootstrapped</strong>
            <span>${selectedPreset.label} is now a named world/plow-area combo with live route-point placement.</span>
          </div>
        </div>
      </div>
    `;

    this.root.append(shell);

    const stage = shell.querySelector<HTMLElement>('#editor-stage');
    const backButton = shell.querySelector<HTMLButtonElement>('#return-to-menu');

    if (!stage || !backButton) {
      throw new Error('Editor view failed to render.');
    }

    this.gameRuntime = new GameRuntime({
      mountPoint: stage,
      playerName: this.playerProfileStore.getPlayerName(),
      devMode: true,
      mode: 'editor',
      worldComboId: selectedPreset.id,
      worldComboLabel: selectedPreset.label,
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

  private readSelectedWorldComboId(): string {
    const stored = window.localStorage.getItem(App.WORLD_COMBO_STORAGE_KEY);
    return stored ? getWorldComboPresetById(stored).id : DEFAULT_WORLD_COMBO_PRESET.id;
  }

  private async showRunResult(
    shell: HTMLElement,
    worldComboId: string,
    worldLabel: string,
    snapshot: RunSnapshot,
  ): Promise<void> {
    const existing = shell.querySelector('.run-result-overlay');
    existing?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'run-result-overlay';
    overlay.innerHTML = `
      <div class="run-result-card">
        <div class="panel-heading">
          <h2>Run Complete</h2>
          <span class="panel-tag">${worldLabel}</span>
        </div>
        <div class="run-result-summary">
          <div class="run-result-score">
            <span>Final Score</span>
            <strong id="run-result-final-score">0 pts</strong>
          </div>
          <div class="run-result-clear">
            <span>Cleared</span>
            <strong>${snapshot.clearedPercent.toFixed(1)}%</strong>
          </div>
        </div>
        <div class="run-result-breakdown">
          <div class="run-result-row"><span>Base score</span><strong id="run-result-base-score">0 pts</strong></div>
          <div class="run-result-row"><span>Speed bonus</span><strong id="run-result-speed-bonus">0 pts</strong></div>
          <div class="run-result-row"><span>Pin misses</span><strong id="run-result-pin-misses">0</strong></div>
          <div class="run-result-row run-result-row-penalty"><span>Pin penalties</span><strong id="run-result-penalties">0 pts</strong></div>
          <div class="run-result-row"><span>Time</span><strong id="run-result-time">0.0s</strong></div>
        </div>
        <div class="run-result-leaderboard">
          <div class="panel-heading">
            <h3>Top 10</h3>
            <span id="run-result-leaderboard-status" class="panel-tag">Submitting</span>
          </div>
          <ol id="run-result-leaderboard-list" class="leaderboard-list" aria-live="polite"></ol>
        </div>
        <div class="run-result-actions">
          <button id="run-result-close" class="secondary-button" type="button">Close</button>
        </div>
      </div>
    `;

    shell.append(overlay);
    overlay.querySelector<HTMLButtonElement>('#run-result-close')?.addEventListener('click', () => overlay.remove());

    const result: RunResultViewModel = {
      playerName: this.playerProfileStore.getPlayerName(),
      worldComboId,
      worldLabel,
      score: snapshot.score,
      baseScore: snapshot.baseScore,
      speedBonus: snapshot.completionBonus,
      penalties: snapshot.penaltyPoints,
      pinMisses: snapshot.pinMisses,
      elapsedSeconds: snapshot.elapsedSeconds,
      clearedPercent: snapshot.clearedPercent,
      leaderboard: [],
    };

    this.animateResultNumbers(overlay, result);

    const status = overlay.querySelector<HTMLElement>('#run-result-leaderboard-status');
    const list = overlay.querySelector<HTMLOListElement>('#run-result-leaderboard-list');
    if (!status || !list) {
      return;
    }

    const requestId = ++this.resultOverlayRequestId;
    try {
      const entries = await this.leaderboardService.submitEntry({
        game: this.getLeaderboardGameKey(),
        name: result.playerName,
        score: result.score,
        timeSeconds: result.elapsedSeconds,
        trackId: worldComboId,
        trackLabel: worldLabel,
      });
      if (requestId !== this.resultOverlayRequestId || !overlay.isConnected) {
        return;
      }
      result.leaderboard = entries.slice(0, 10);
      status.textContent = 'Submitted';
      list.replaceChildren(...result.leaderboard.map((entry) => this.renderLeaderboardItem(entry)));
    } catch (error) {
      console.error('Failed to submit leaderboard entry', error);
      status.textContent = 'Offline';
      list.replaceChildren();
    }
  }

  private animateResultNumbers(overlay: HTMLElement, result: RunResultViewModel): void {
    const finalScore = overlay.querySelector<HTMLElement>('#run-result-final-score');
    const baseScore = overlay.querySelector<HTMLElement>('#run-result-base-score');
    const speedBonus = overlay.querySelector<HTMLElement>('#run-result-speed-bonus');
    const pinMisses = overlay.querySelector<HTMLElement>('#run-result-pin-misses');
    const penalties = overlay.querySelector<HTMLElement>('#run-result-penalties');
    const time = overlay.querySelector<HTMLElement>('#run-result-time');
    if (!finalScore || !baseScore || !speedBonus || !pinMisses || !penalties || !time) {
      return;
    }

    const start = performance.now();
    const durationMs = 1350;

    const tick = (now: number) => {
      if (!overlay.isConnected) {
        return;
      }

      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      finalScore.textContent = `${Math.round(result.score * eased).toLocaleString()} pts`;
      baseScore.textContent = `${Math.round(result.baseScore * eased).toLocaleString()} pts`;
      speedBonus.textContent = `${Math.round(result.speedBonus * eased).toLocaleString()} pts`;
      pinMisses.textContent = `${Math.round(result.pinMisses * eased)}`;
      penalties.textContent = `-${Math.round(result.penalties * eased).toLocaleString()} pts`;
      time.textContent = `${(result.elapsedSeconds * eased).toFixed(1)}s`;

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      }
    };

    window.requestAnimationFrame(tick);
  }

  private getLeaderboardGameKey(): string {
    return 'plough';
  }
}
