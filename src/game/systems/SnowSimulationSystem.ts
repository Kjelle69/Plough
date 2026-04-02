import type { SnowField } from '../core/types';

interface SnowSimulationSystemOptions {
  relaxationPasses?: number;
  relaxationFactor?: number;
}

export class SnowSimulationSystem {
  private readonly relaxationPasses: number;
  private readonly relaxationFactor: number;

  constructor(options: SnowSimulationSystemOptions = {}) {
    this.relaxationPasses = options.relaxationPasses ?? 0;
    this.relaxationFactor = options.relaxationFactor ?? 0;
  }

  step(fields: SnowField[]): void {
    for (const field of fields) {
      if (this.relaxationPasses > 0 && this.relaxationFactor > 0) {
        field.relax(this.relaxationPasses, this.relaxationFactor);
      }
      field.render();
    }
  }
}
