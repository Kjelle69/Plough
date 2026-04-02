import type { RunSnapshot } from '../core/types';

export class GameHud {
  private readonly element = document.createElement('div');

  private readonly scoreValue: HTMLElement;

  private readonly timerValue: HTMLElement;

  private readonly progressValue: HTMLElement;

  private readonly patchValue: HTMLSpanElement;

  private readonly fill: HTMLDivElement;

  private readonly status: HTMLDivElement;

  constructor() {
    this.element.className = 'game-hud';
    this.element.innerHTML = `
      <div class="hud-strip">
        <section class="hud-card">
          <span class="hud-label">Score</span>
          <strong id="hud-score"></strong>
        </section>
        <section class="hud-card">
          <span class="hud-label">Time</span>
          <strong id="hud-time"></strong>
        </section>
        <section class="hud-card">
          <span class="hud-label">Cleared</span>
          <strong id="hud-progress"></strong>
          <span id="hud-patches" class="hud-subvalue"></span>
        </section>
      </div>
      <section class="hud-progress-card">
        <div class="hud-progress-heading">
          <span class="hud-label">Snow Route Progress</span>
        </div>
        <div class="hud-progress-track"><div class="hud-progress-fill"></div></div>
      </section>
      <div class="hud-status" aria-live="polite"></div>
    `;

    const scoreValue = this.element.querySelector<HTMLElement>('#hud-score');
    const timerValue = this.element.querySelector<HTMLElement>('#hud-time');
    const progressValue = this.element.querySelector<HTMLElement>('#hud-progress');
    const patchValue = this.element.querySelector<HTMLSpanElement>('#hud-patches');
    const fill = this.element.querySelector<HTMLDivElement>('.hud-progress-fill');
    const status = this.element.querySelector<HTMLDivElement>('.hud-status');

    if (!scoreValue || !timerValue || !progressValue || !patchValue || !fill || !status) {
      throw new Error('Failed to initialize game HUD.');
    }

    this.scoreValue = scoreValue;
    this.timerValue = timerValue;
    this.progressValue = progressValue;
    this.patchValue = patchValue;
    this.fill = fill;
    this.status = status;
  }

  mount(parent: HTMLElement): void {
    parent.append(this.element);
  }

  update(snapshot: RunSnapshot): void {
    this.scoreValue.textContent = `${snapshot.score.toLocaleString()} pts`;
    this.timerValue.textContent = Number.isFinite(snapshot.timeRemaining) ? `${snapshot.timeRemaining.toFixed(1)}s` : '∞';
    this.progressValue.textContent = `${snapshot.clearedPercent.toFixed(1)}%`;
    this.patchValue.textContent = `${snapshot.clearedPatches}/${snapshot.totalPatches} zones`;
    this.fill.style.width = `${snapshot.clearedPercent}%`;

    if (snapshot.status === 'complete') {
      this.status.textContent = 'Route complete. Press R to restart or use Return to Menu.';
      this.status.dataset.state = 'complete';
      return;
    }

    if (snapshot.status === 'failed') {
      this.status.textContent = 'Time expired. Press R to restart or use Return to Menu.';
      this.status.dataset.state = 'failed';
      return;
    }

    this.status.textContent = snapshot.highlightedPatch
      ? `Clearing ${snapshot.highlightedPatch}`
      : 'Follow the hidden route under the snow and clear it between the markers.';
    this.status.dataset.state = 'active';
  }

  dispose(): void {
    this.element.remove();
  }
}
