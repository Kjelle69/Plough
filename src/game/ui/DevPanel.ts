import type { GameplayTuning } from '../core/tuning';

interface DevPanelOptions {
  tuning: GameplayTuning;
  defaults: GameplayTuning;
}

interface SliderDefinition {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDefinition[] = [
  { path: 'vehicle.forwardEngineForce', label: 'Forward Force', min: 6, max: 35, step: 0.1 },
  { path: 'vehicle.maxForwardSpeed', label: 'Forward Speed', min: 4, max: 22, step: 0.1 },
  { path: 'vehicle.maxReverseSpeed', label: 'Reverse Speed', min: 2, max: 12, step: 0.1 },
  { path: 'vehicle.reverseEngineForce', label: 'Reverse Force', min: 6, max: 20, step: 0.1 },
  { path: 'snow.cutStrength', label: 'Cut Strength', min: 1, max: 8, step: 0.1 },
  { path: 'snow.compactionRatio', label: 'Compaction', min: 0.1, max: 1, step: 0.01 },
  { path: 'snow.forwardWeight', label: 'Front Weight', min: 0.1, max: 0.9, step: 0.01 },
  { path: 'snow.forwardApronWeight', label: 'Front Apron', min: 0.05, max: 0.5, step: 0.01 },
  { path: 'snow.sideBankWeight', label: 'Side Banks', min: 0.05, max: 1.4, step: 0.01 },
  { path: 'snow.sideBankHeight', label: 'Side Bank Height', min: 0.2, max: 4.5, step: 0.01 },
  { path: 'snow.sideBankInnerWidth', label: 'Side Inner Width', min: 0.2, max: 9.6, step: 0.01 },
  { path: 'snow.sideBankOuterWidth', label: 'Side Outer Width', min: 0.4, max: 12.8, step: 0.01 },
  { path: 'snow.sideBankLength', label: 'Side Bank Length', min: 1, max: 10, step: 0.1 },
  { path: 'snow.sideBermShare', label: 'Side Berm Share', min: 0, max: 0.98, step: 0.01 },
  { path: 'snow.sideBermDistance', label: 'Side Berm Distance', min: 0.5, max: 8, step: 0.01 },
  { path: 'snow.pileHeightScale', label: 'Pile Height', min: 0.5, max: 2.5, step: 0.01 },
  { path: 'snow.baseSnowHeight', label: 'Base Snow Height', min: 0.4, max: 1.8, step: 0.01 },
  { path: 'vehicle.frontLoadDivisor', label: 'Load Divisor', min: 0.2, max: 1.5, step: 0.01 },
  { path: 'vehicle.frontLoadStopThreshold', label: 'Stop Threshold', min: 0.1, max: 1.5, step: 0.01 },
  { path: 'vehicle.frontLoadStopStrength', label: 'Stop Strength', min: 1, max: 30, step: 0.1 },
  { path: 'vehicle.frontLoadResistanceStrength', label: 'Load Resistance', min: 0.5, max: 5, step: 0.1 },
];

export class DevPanel {
  private readonly element = document.createElement('aside');
  private readonly tuning: GameplayTuning;
  private readonly defaults: GameplayTuning;

  constructor(options: DevPanelOptions) {
    this.tuning = options.tuning;
    this.defaults = options.defaults;
    this.element.className = 'dev-panel';
    this.element.innerHTML = `
      <div class="dev-panel-header">
        <strong>Dev Tuning</strong>
        <button type="button" class="dev-panel-reset">Reset</button>
      </div>
      <div class="dev-panel-grid"></div>
    `;

    const grid = this.element.querySelector<HTMLDivElement>('.dev-panel-grid');
    const resetButton = this.element.querySelector<HTMLButtonElement>('.dev-panel-reset');
    if (!grid || !resetButton) {
      throw new Error('Failed to initialize dev panel.');
    }

    for (const slider of SLIDERS) {
      const row = document.createElement('label');
      row.className = 'dev-slider';
      const title = document.createElement('span');
      title.className = 'dev-slider-label';
      title.textContent = slider.label;
      const value = document.createElement('span');
      value.className = 'dev-slider-value';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(slider.min);
      input.max = String(slider.max);
      input.step = String(slider.step);
      input.value = String(this.getValue(slider.path));

      const sync = () => {
        const parsed = Number(input.value);
        this.setValue(slider.path, parsed);
        value.textContent = parsed.toFixed(slider.step < 0.1 ? 2 : 1);
      };

      input.addEventListener('input', sync);
      sync();

      row.append(title, value, input);
      grid.append(row);
    }

    resetButton.addEventListener('click', () => this.reset());
  }

  mount(parent: HTMLElement): void {
    parent.append(this.element);
  }

  dispose(): void {
    this.element.remove();
  }

  private reset(): void {
    const inputs = this.element.querySelectorAll<HTMLInputElement>('input[type="range"]');
    inputs.forEach((input, index) => {
      const slider = SLIDERS[index];
      const value = this.getDefaultValue(slider.path);
      this.setValue(slider.path, value);
      input.value = String(value);
      const label = input.parentElement?.querySelector<HTMLElement>('.dev-slider-value');
      if (label) {
        label.textContent = value.toFixed(slider.step < 0.1 ? 2 : 1);
      }
    });
  }

  private getValue(path: string): number {
    const [scope, key] = path.split('.') as [keyof GameplayTuning, string];
    return (this.tuning[scope] as unknown as Record<string, number>)[key];
  }

  private getDefaultValue(path: string): number {
    const [scope, key] = path.split('.') as [keyof GameplayTuning, string];
    return (this.defaults[scope] as unknown as Record<string, number>)[key];
  }

  private setValue(path: string, value: number): void {
    const [scope, key] = path.split('.') as [keyof GameplayTuning, string];
    (this.tuning[scope] as unknown as Record<string, number>)[key] = value;
  }
}
