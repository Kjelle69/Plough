import type { LevelDefinition, RouteTarget, RunSnapshot, RunStatus, SnowField } from '../core/types';

interface PlowScoringSystemOptions {
  level: LevelDefinition;
  runDurationSeconds?: number;
  devMode?: boolean;
}

export class PlowScoringSystem {
  private readonly level: LevelDefinition;
  private readonly runDurationSeconds: number;
  private readonly devMode: boolean;
  private readonly routeCells = new Map<string, Array<{ field: SnowField; index: number }>>();
  private timeRemaining = 0;
  private score = 0;
  private status: RunStatus = 'active';
  private highlightedPatch: string | null = null;
  private previousClearFractions = new Map<string, number>();

  constructor(options: PlowScoringSystemOptions) {
    this.level = options.level;
    this.runDurationSeconds = options.runDurationSeconds ?? 75;
    this.devMode = options.devMode ?? false;
    this.reset();
  }

  reset(): void {
    this.timeRemaining = this.devMode ? Number.POSITIVE_INFINITY : this.runDurationSeconds;
    this.score = 0;
    this.status = 'active';
    this.highlightedPatch = null;
    this.previousClearFractions.clear();
    this.routeCells.clear();

    if (this.level.routeTargets.length > 0) {
      for (const target of this.level.routeTargets) {
        this.routeCells.set(target.label, this.buildRouteCells(target));
        this.previousClearFractions.set(target.label, this.getRouteClearFraction(target));
      }
      return;
    }

    for (const field of this.level.snowFields) {
      this.previousClearFractions.set(field.label, field.getClearFraction());
    }
  }

  update(deltaSeconds: number): RunSnapshot {
    if (this.status !== 'active') {
      return this.getSnapshot();
    }

    if (!this.devMode) {
      this.timeRemaining = Math.max(0, this.timeRemaining - deltaSeconds);
    }
    this.highlightedPatch = null;

    const scoringTargets = this.level.routeTargets.length > 0
      ? this.level.routeTargets.map((target) => ({
          label: target.label,
          totalCells: this.routeCells.get(target.label)?.length ?? 0,
          clearFraction: this.getRouteClearFraction(target),
        }))
      : this.level.snowFields.map((field) => ({
          label: field.label,
          totalCells: field.totalCells,
          clearFraction: field.getClearFraction(),
        }));

    for (const target of scoringTargets) {
      const previous = this.previousClearFractions.get(target.label) ?? 0;
      const current = target.clearFraction;
      const delta = Math.max(current - previous, 0);
      this.previousClearFractions.set(target.label, current);

      if (delta > 0.0001) {
        this.highlightedPatch = target.label;
        this.score += Math.round(delta * target.totalCells * 9);
      }
    }

    const snapshot = this.getSnapshot();
    if (snapshot.clearedPercent >= 100) {
      this.status = 'complete';
    } else if (!this.devMode && this.timeRemaining <= 0) {
      this.status = 'failed';
    }

    return this.getSnapshot();
  }

  getSnapshot(): RunSnapshot {
    const progressTargets = this.level.routeTargets.length > 0
      ? this.level.routeTargets.map((target) => ({
          totalCells: this.routeCells.get(target.label)?.length ?? 0,
          clearFraction: this.getRouteClearFraction(target),
        }))
      : this.level.snowFields.map((field) => ({
          totalCells: field.totalCells,
          clearFraction: field.getClearFraction(),
        }));
    const totalCells = progressTargets.reduce((sum, target) => sum + target.totalCells, 0);
    const clearedCells = progressTargets.reduce((sum, target) => sum + target.clearFraction * target.totalCells, 0);
    const clearedPatches = progressTargets.filter((target) => target.clearFraction >= 0.82).length;
    const totalPatches = progressTargets.length;

    return {
      timeRemaining: Number.isFinite(this.timeRemaining) ? Number(this.timeRemaining.toFixed(1)) : Number.POSITIVE_INFINITY,
      score: this.score,
      clearedPercent: totalCells === 0 ? 0 : Number(((clearedCells / totalCells) * 100).toFixed(1)),
      clearedPatches,
      totalPatches,
      status: this.status,
      highlightedPatch: this.highlightedPatch,
    };
  }

  private getRouteClearFraction(target: RouteTarget): number {
    const cells = this.routeCells.get(target.label) ?? [];
    if (cells.length === 0) {
      return 0;
    }

    let clearedCells = 0;
    for (const cell of cells) {
      const dynamicHeight = cell.field.dynamicHeight[cell.index];
      if (dynamicHeight < 1) {
        clearedCells += 1 - Math.min(dynamicHeight, 1);
      }
    }

    return clearedCells / cells.length;
  }

  private buildRouteCells(target: RouteTarget): Array<{ field: SnowField; index: number }> {
    const field = this.level.snowFields.find((candidate) => candidate.label === target.fieldLabel);
    if (!field) {
      return [];
    }

    const halfWidth = target.size.x / 2;
    const halfDepth = target.size.y / 2;
    const minCell = field.toCell(target.center.x - halfWidth, target.center.y - halfDepth);
    const maxCell = field.toCell(target.center.x + halfWidth, target.center.y + halfDepth);

    if (!minCell || !maxCell) {
      return [];
    }

    const cells: Array<{ field: SnowField; index: number }> = [];
    for (let row = Math.min(minCell.row, maxCell.row); row <= Math.max(minCell.row, maxCell.row); row += 1) {
      for (let column = Math.min(minCell.column, maxCell.column); column <= Math.max(minCell.column, maxCell.column); column += 1) {
        const worldX = field.center.x - field.size.x / 2 + column * field.cellWidth;
        const worldZ = field.center.y - field.size.y / 2 + row * field.cellDepth;
        if (
          worldX < target.center.x - halfWidth ||
          worldX > target.center.x + halfWidth ||
          worldZ < target.center.y - halfDepth ||
          worldZ > target.center.y + halfDepth
        ) {
          continue;
        }

        cells.push({ field, index: field.cellIndex(column, row) });
      }
    }

    return cells;
  }
}
