import type { LevelDefinition, RouteTarget, RunSnapshot, RunStatus, SnowField } from '../core/types';
import { Vector2 } from 'three';

interface PlowScoringSystemOptions {
  level: LevelDefinition;
  runDurationSeconds?: number;
  devMode?: boolean;
}

export class PlowScoringSystem {
  private static readonly ROUTE_CLEAR_FULL_THRESHOLD = 0.58;
  private static readonly ROUTE_CLEAR_ZERO_THRESHOLD = 1;
  private readonly level: LevelDefinition;
  private readonly runDurationSeconds: number;
  private readonly devMode: boolean;
  private readonly routeCells = new Map<string, Array<{ field: SnowField; index: number; weight: number }>>();
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
          totalCells: this.getRouteCellWeight(target),
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

  applyPenalty(amount: number, highlightedPatch: string | null = null): RunSnapshot {
    this.score = Math.max(0, this.score - Math.max(0, Math.round(amount)));
    this.highlightedPatch = highlightedPatch;
    return this.getSnapshot();
  }

  getSnapshot(): RunSnapshot {
    const progressTargets = this.level.routeTargets.length > 0
      ? this.level.routeTargets.map((target) => ({
          totalCells: this.getRouteCellWeight(target),
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
      const clearContribution = this.getAggressiveRouteClearContribution(dynamicHeight);
      if (clearContribution > 0) {
        clearedCells += clearContribution * cell.weight;
      }
    }

    const totalWeight = this.getRouteCellWeight(target);
    return totalWeight <= 0 ? 0 : clearedCells / totalWeight;
  }

  private buildRouteCells(target: RouteTarget): Array<{ field: SnowField; index: number; weight: number }> {
    const cells: Array<{ field: SnowField; index: number; weight: number }> = [];
    const routeBounds = this.getRouteBounds(target);
    const halfWidth = target.width / 2;

    for (const field of this.level.snowFields) {
      const fieldMinX = field.center.x - field.size.x / 2;
      const fieldMaxX = field.center.x + field.size.x / 2;
      const fieldMinZ = field.center.y - field.size.y / 2;
      const fieldMaxZ = field.center.y + field.size.y / 2;

      if (
        fieldMaxX < routeBounds.minX - halfWidth ||
        fieldMinX > routeBounds.maxX + halfWidth ||
        fieldMaxZ < routeBounds.minZ - halfWidth ||
        fieldMinZ > routeBounds.maxZ + halfWidth
      ) {
        continue;
      }

      for (let row = 0; row < field.rows; row += 1) {
        for (let column = 0; column < field.columns; column += 1) {
          if (!field.isCellActive(column, row)) {
            continue;
          }

          const worldX = field.center.x - field.size.x / 2 + column * field.cellWidth;
          const worldZ = field.center.y - field.size.y / 2 + row * field.cellDepth;
          if (
            worldX < routeBounds.minX - halfWidth ||
            worldX > routeBounds.maxX + halfWidth ||
            worldZ < routeBounds.minZ - halfWidth ||
            worldZ > routeBounds.maxZ + halfWidth
          ) {
            continue;
          }

          const routeDistanceSquared = this.getRouteDistanceSquared(target, worldX, worldZ);
          if (routeDistanceSquared > halfWidth * halfWidth) {
            continue;
          }

          const normalizedDistance = Math.min(1, Math.sqrt(routeDistanceSquared) / Math.max(halfWidth, 0.0001));
          const centerBias = 1 - normalizedDistance;
          const weight = 0.25 + Math.pow(centerBias, 1.35) * 0.75;
          cells.push({ field, index: field.cellIndex(column, row), weight });
        }
      }
    }

    return cells;
  }

  private getRouteDistanceSquared(target: RouteTarget, worldX: number, worldZ: number): number {
    const point = new Vector2(worldX, worldZ);
    const points = target.points;
    if (points.length < 2) {
      return Number.POSITIVE_INFINITY;
    }

    const segmentCount = target.closed ? points.length : points.length - 1;
    let minDistanceSquared = Number.POSITIVE_INFINITY;

    for (let index = 0; index < segmentCount; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      minDistanceSquared = Math.min(minDistanceSquared, this.distanceToSegmentSquared(point, start, end));
    }

    return minDistanceSquared;
  }

  private getRouteCellWeight(target: RouteTarget): number {
    const cells = this.routeCells.get(target.label) ?? [];
    return cells.reduce((sum, cell) => sum + cell.weight, 0);
  }

  private getAggressiveRouteClearContribution(dynamicHeight: number): number {
    if (dynamicHeight <= PlowScoringSystem.ROUTE_CLEAR_FULL_THRESHOLD) {
      return 1;
    }

    if (dynamicHeight >= PlowScoringSystem.ROUTE_CLEAR_ZERO_THRESHOLD) {
      return 0;
    }

    const normalized =
      (dynamicHeight - PlowScoringSystem.ROUTE_CLEAR_FULL_THRESHOLD) /
      (PlowScoringSystem.ROUTE_CLEAR_ZERO_THRESHOLD - PlowScoringSystem.ROUTE_CLEAR_FULL_THRESHOLD);

    return 1 - Math.pow(normalized, 1.3);
  }

  private distanceToSegmentSquared(point: Vector2, start: Vector2, end: Vector2): number {
    const delta = end.clone().sub(start);
    const lengthSquared = delta.lengthSq();
    if (lengthSquared <= 0.0001) {
      return point.distanceToSquared(start);
    }

    const t = Math.max(0, Math.min(1, point.clone().sub(start).dot(delta) / lengthSquared));
    const projection = start.clone().addScaledVector(delta, t);
    return point.distanceToSquared(projection);
  }

  private getRouteBounds(target: RouteTarget): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const point of target.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.y);
      maxZ = Math.max(maxZ, point.y);
    }

    return { minX, maxX, minZ, maxZ };
  }
}
