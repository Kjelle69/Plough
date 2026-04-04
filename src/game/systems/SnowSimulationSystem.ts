import type { SnowField } from '../core/types';

interface SnowSimulationSystemOptions {
  relaxationPasses?: number;
  relaxationFactor?: number;
}

export class SnowSimulationSystem {
  private static readonly EDGE_ALIGNMENT_TOLERANCE = 0.35;
  private static readonly EDGE_BLEND = 0.5;
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
    }

    this.blendAdjacentFieldEdges(fields);

    for (const field of fields) {
      if (field.needsRender()) {
        field.render();
      }
    }
  }

  private blendAdjacentFieldEdges(fields: SnowField[]): void {
    for (let index = 0; index < fields.length; index += 1) {
      for (let neighborIndex = index + 1; neighborIndex < fields.length; neighborIndex += 1) {
        const a = fields[index];
        const b = fields[neighborIndex];
        this.blendVerticalEdgePair(a, b);
        this.blendVerticalEdgePair(b, a);
        this.blendHorizontalEdgePair(a, b);
        this.blendHorizontalEdgePair(b, a);
      }
    }
  }

  private blendVerticalEdgePair(left: SnowField, right: SnowField): void {
    const leftEdgeX = left.center.x + left.size.x / 2;
    const rightEdgeX = right.center.x - right.size.x / 2;
    if (Math.abs(leftEdgeX - rightEdgeX) > SnowSimulationSystem.EDGE_ALIGNMENT_TOLERANCE) {
      return;
    }

    const overlapMinZ = Math.max(left.center.y - left.size.y / 2, right.center.y - right.size.y / 2);
    const overlapMaxZ = Math.min(left.center.y + left.size.y / 2, right.center.y + right.size.y / 2);
    if (overlapMaxZ <= overlapMinZ) {
      return;
    }

    for (let row = 0; row < left.rows; row += 1) {
      const worldZ = left.center.y - left.size.y / 2 + row * left.cellDepth;
      if (worldZ < overlapMinZ || worldZ > overlapMaxZ) {
        continue;
      }

      const rightCell = right.toCell(rightEdgeX, worldZ);
      if (!rightCell) {
        continue;
      }

      const leftColumn = left.columns - 1;
      const rightColumn = 0;
      if (!left.isCellActive(leftColumn, row) || !right.isCellActive(rightColumn, rightCell.row)) {
        continue;
      }

      const leftIndex = left.cellIndex(leftColumn, row);
      const rightIndex = right.cellIndex(rightColumn, rightCell.row);
      const blended =
        left.dynamicHeight[leftIndex] * (1 - SnowSimulationSystem.EDGE_BLEND) +
        right.dynamicHeight[rightIndex] * SnowSimulationSystem.EDGE_BLEND;
      left.setDynamicHeight(leftColumn, row, blended);
      right.setDynamicHeight(rightColumn, rightCell.row, blended);
    }
  }

  private blendHorizontalEdgePair(top: SnowField, bottom: SnowField): void {
    const topEdgeZ = top.center.y + top.size.y / 2;
    const bottomEdgeZ = bottom.center.y - bottom.size.y / 2;
    if (Math.abs(topEdgeZ - bottomEdgeZ) > SnowSimulationSystem.EDGE_ALIGNMENT_TOLERANCE) {
      return;
    }

    const overlapMinX = Math.max(top.center.x - top.size.x / 2, bottom.center.x - bottom.size.x / 2);
    const overlapMaxX = Math.min(top.center.x + top.size.x / 2, bottom.center.x + bottom.size.x / 2);
    if (overlapMaxX <= overlapMinX) {
      return;
    }

    for (let column = 0; column < top.columns; column += 1) {
      const worldX = top.center.x - top.size.x / 2 + column * top.cellWidth;
      if (worldX < overlapMinX || worldX > overlapMaxX) {
        continue;
      }

      const bottomCell = bottom.toCell(worldX, bottomEdgeZ);
      if (!bottomCell) {
        continue;
      }

      const topRow = top.rows - 1;
      const bottomRow = 0;
      if (!top.isCellActive(column, topRow) || !bottom.isCellActive(bottomCell.column, bottomRow)) {
        continue;
      }

      const topIndex = top.cellIndex(column, topRow);
      const bottomIndex = bottom.cellIndex(bottomCell.column, bottomRow);
      const blended =
        top.dynamicHeight[topIndex] * (1 - SnowSimulationSystem.EDGE_BLEND) +
        bottom.dynamicHeight[bottomIndex] * SnowSimulationSystem.EDGE_BLEND;
      top.setDynamicHeight(column, topRow, blended);
      bottom.setDynamicHeight(bottomCell.column, bottomRow, blended);
    }
  }
}
