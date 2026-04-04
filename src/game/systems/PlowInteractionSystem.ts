import { BufferGeometry, LineBasicMaterial, LineLoop, Vector2, Vector3 } from 'three';
import type { SnowField } from '../core/types';
import type { SnowTuning } from '../core/tuning';

export interface BladeProbeState {
  center: Vector2;
  forward: Vector2;
  right: Vector2;
  speed: number;
  vehicleCenter: Vector2;
  vehicleForward: Vector2;
  bladeAngle: number;
  bladeLift: number;
}

export interface BladeInteractionDebugState {
  removedMass: number;
  depositedMass: number;
  affectedCells: number;
  frontPileLoad: number;
}

interface PlowInteractionSystemOptions {
  showDebugBlade?: boolean;
  tuning?: SnowTuning;
}

type DepositKernel = 'default' | 'wide' | 'front';

const BLADE_WIDTH = 2.9;
const BLADE_DEPTH = 0.42;
const CUT_STRENGTH = 4.6;
const FORWARD_PILE_DISTANCE = 2.0;
const FORWARD_PILE_LENGTH = 1.86;
const FORWARD_APRON_DISTANCE = 2.8;
const FORWARD_APRON_LENGTH = 4.1;
const SIDE_BANK_INNER_DISTANCE = 1.08;
const SIDE_BANK_OUTER_DISTANCE = 1.72;
const SIDE_BANK_LENGTH = 6.3;
const SIDE_BANK_BERM_DISTANCE = 2.8;
const COMPACTION_RATIO = 0.52;
const FORWARD_WEIGHT = 0.46;
const FORWARD_APRON_WEIGHT = 1.9;
const SIDE_BANK_WEIGHT = 0.08;
const SIDE_BANK_BERM_SHARE = 0.52;
const SIDE_BANK_OUTER_SHARE = 0.2;
const BODY_COMPACTION_WIDTH = 2.9;
const BODY_COMPACTION_DEPTH = 3.7;
const BODY_COMPACTION_STRENGTH = 1.05;
const MAX_BLADE_ANGLE = Math.PI / 4;

export class PlowInteractionSystem {
  readonly debugBlade: LineLoop;

  private readonly footprintCorners = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private readonly tuning?: SnowTuning;

  constructor(options: PlowInteractionSystemOptions = {}) {
    this.tuning = options.tuning;
    this.debugBlade = new LineLoop(
      new BufferGeometry().setFromPoints([new Vector3(), new Vector3(), new Vector3(), new Vector3()]),
      new LineBasicMaterial({ color: '#ff9d62', transparent: true, opacity: 0.65 }),
    );
    this.debugBlade.visible = options.showDebugBlade ?? false;
  }

  applyToField(field: SnowField, probe: BladeProbeState, deltaSeconds: number): BladeInteractionDebugState {
    let removedMass = 0;
    let depositedMass = 0;
    let affectedCells = 0;
    let frontPileLoad = 0;

    const speedMagnitude = Math.abs(probe.speed);
    const bodyCells = this.collectFootprintCells(
      field,
      probe.vehicleCenter,
      probe.vehicleForward,
      probe.right,
      BODY_COMPACTION_WIDTH,
      BODY_COMPACTION_DEPTH,
    );

    if (bodyCells.length > 0 && speedMagnitude > 0.12) {
      const bodyCompressionRate =
        speedMagnitude * deltaSeconds * BODY_COMPACTION_STRENGTH * (probe.speed < 0 ? 1.55 : 0.45);

      for (const cell of bodyCells) {
        const compressed = this.compactWithKernel(
          field,
          cell.column,
          cell.row,
          bodyCompressionRate * Math.max(0.2, cell.weight),
        );
        if (compressed <= 0) {
          continue;
        }

        removedMass += compressed;
        affectedCells += 1;
      }
    }

    const bladeEngagement = Math.max(0, 1 - probe.bladeLift);
    const bladeCells = this.collectBladeCells(field, probe.center, probe.forward, probe.right, BLADE_WIDTH, BLADE_DEPTH);
    if (bladeCells.length === 0 || probe.speed <= 0.15 || bladeEngagement <= 0.08) {
      const debugState = { removedMass, depositedMass, affectedCells, frontPileLoad };
      field.setDebugState(debugState);
      this.updateDebugBlade(probe);
      return debugState;
    }

    // Cut a full rectangular blade footprint, then move the removed mass into target zones.
    const cutStrength = this.tuning?.cutStrength ?? CUT_STRENGTH;
    const removalRate = (probe.speed + 0.55) * deltaSeconds * cutStrength * bladeEngagement;
    for (const cell of bladeCells) {
      const removed = this.removeWithKernel(
        field,
        cell.column,
        cell.row,
        removalRate * Math.max(0.28, cell.weight),
      );
      if (removed <= 0) {
        continue;
      }
      removedMass += removed;
      affectedCells += 1;
    }

    if (removedMass > 0) {
      // Freshly cut snow compacts heavily against the blade, so only part of the removed
      // volume remains as visible pile height in the simulation.
      const visibleMass = removedMass * (this.tuning?.compactionRatio ?? COMPACTION_RATIO);
      const bladeAngleBias = Math.max(-1, Math.min(1, probe.bladeAngle / MAX_BLADE_ANGLE));
      const dischargeOffset = bladeAngleBias * BLADE_WIDTH * 1.35;
      const forwardPile = this.collectDepositCells(
        field,
        probe.center
          .clone()
          .addScaledVector(probe.forward, FORWARD_PILE_DISTANCE)
          .addScaledVector(probe.right, dischargeOffset * 0.45),
        probe.forward,
        probe.right,
        BLADE_WIDTH * 1.9,
        FORWARD_PILE_LENGTH * 1.45,
        { lateralPower: 0.18, longitudinalPower: 1.06, minWeight: 0.62 },
      );
      const forwardApron = this.collectDepositCells(
        field,
        probe.center
          .clone()
          .addScaledVector(probe.forward, FORWARD_APRON_DISTANCE)
          .addScaledVector(probe.right, dischargeOffset * 0.95),
        probe.forward,
        probe.right,
        BLADE_WIDTH * 2.35,
        FORWARD_APRON_LENGTH * 1.4,
        { lateralPower: 0.1, longitudinalPower: 0.96, minWeight: 0.7 },
      );
      const positiveSideBias =
        bladeAngleBias >= 0
          ? 1 + bladeAngleBias * 4.2
          : Math.max(0, 1 + bladeAngleBias * 1.25);
      const negativeSideBias =
        bladeAngleBias <= 0
          ? 1 + Math.abs(bladeAngleBias) * 4.2
          : Math.max(0, 1 - bladeAngleBias * 1.25);
      const frontShareScale = 1 + Math.abs(bladeAngleBias) * 0.4;
      const sideBankLength = this.tuning?.sideBankLength ?? SIDE_BANK_LENGTH;
      const sideInnerWidth = this.tuning?.sideBankInnerWidth ?? 0.42;
      const sideOuterWidth = this.tuning?.sideBankOuterWidth ?? 1.34;
      const sideBankHeight = this.tuning?.sideBankHeight ?? 1;
      const sideBermShare = this.tuning?.sideBermShare ?? SIDE_BANK_BERM_SHARE;
      const sideInnerDistance = SIDE_BANK_INNER_DISTANCE + BLADE_WIDTH * sideInnerWidth * 0.24;
      const sideOuterDistance = SIDE_BANK_OUTER_DISTANCE + BLADE_WIDTH * sideOuterWidth * 0.22;
      const sideBermDistance =
        (this.tuning?.sideBermDistance ?? SIDE_BANK_BERM_DISTANCE) + BLADE_WIDTH * sideOuterWidth * 0.42;
      const sideInnerLeft = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, sideInnerDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * sideInnerWidth * 1.35,
        sideBankLength,
        { lateralPower: 0.06, longitudinalPower: 0.82, minWeight: 0.74 },
      );
      const sideInnerRight = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, -sideInnerDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * sideInnerWidth * 1.35,
        sideBankLength,
        { lateralPower: 0.06, longitudinalPower: 0.82, minWeight: 0.74 },
      );
      const sideOuterLeft = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, sideOuterDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * sideOuterWidth * 1.85,
        sideBankLength * 1.95,
        { lateralPower: 0.04, longitudinalPower: 0.76, minWeight: 0.78 },
      );
      const sideOuterRight = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, -sideOuterDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * sideOuterWidth * 1.85,
        sideBankLength * 1.95,
        { lateralPower: 0.04, longitudinalPower: 0.76, minWeight: 0.78 },
      );
      const sideBermLeft = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, sideBermDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * (sideOuterWidth * 3.1),
        sideBankLength * 2.8,
        { lateralPower: 0.02, longitudinalPower: 0.72, minWeight: 0.86 },
      );
      const sideBermRight = this.collectDepositCells(
        field,
        probe.center.clone().addScaledVector(probe.right, -sideBermDistance),
        probe.forward,
        probe.right,
        BLADE_WIDTH * (sideOuterWidth * 3.1),
        sideBankLength * 2.8,
        { lateralPower: 0.02, longitudinalPower: 0.72, minWeight: 0.86 },
      );

      depositedMass += this.depositMass(
        field,
        forwardPile,
        visibleMass * (this.tuning?.forwardWeight ?? FORWARD_WEIGHT) * frontShareScale,
        'front',
      );
      depositedMass += this.depositMass(
        field,
        forwardApron,
        visibleMass * (this.tuning?.forwardApronWeight ?? FORWARD_APRON_WEIGHT) * frontShareScale,
        'front',
      );
      const sideBankWeight = this.tuning?.sideBankWeight ?? SIDE_BANK_WEIGHT;
      depositedMass += this.depositMass(
        field,
        sideInnerLeft,
        visibleMass *
          sideBankHeight *
          (sideBankWeight / 2) *
          (1 - SIDE_BANK_OUTER_SHARE) *
          (1 - sideBermShare) *
          positiveSideBias,
        'wide',
      );
      depositedMass += this.depositMass(
        field,
        sideInnerRight,
        visibleMass *
          sideBankHeight *
          (sideBankWeight / 2) *
          (1 - SIDE_BANK_OUTER_SHARE) *
          (1 - sideBermShare) *
          negativeSideBias,
        'wide',
      );
      depositedMass += this.depositMass(
        field,
        sideOuterLeft,
        visibleMass *
          sideBankHeight *
          (sideBankWeight / 2) *
          SIDE_BANK_OUTER_SHARE *
          (1 - sideBermShare) *
          positiveSideBias,
        'wide',
      );
      depositedMass += this.depositMass(
        field,
        sideOuterRight,
        visibleMass *
          sideBankHeight *
          (sideBankWeight / 2) *
          SIDE_BANK_OUTER_SHARE *
          (1 - sideBermShare) *
          negativeSideBias,
        'wide',
      );
      depositedMass += this.depositMass(
        field,
        sideBermLeft,
        visibleMass * sideBankHeight * (sideBankWeight / 2) * sideBermShare * positiveSideBias,
        'wide',
      );
      depositedMass += this.depositMass(
        field,
        sideBermRight,
        visibleMass * sideBankHeight * (sideBankWeight / 2) * sideBermShare * negativeSideBias,
        'wide',
      );

      frontPileLoad = this.measureFrontPileLoad(field, [...forwardPile, ...forwardApron]);
    }

    const debugState = { removedMass, depositedMass, affectedCells, frontPileLoad };
    field.setDebugState(debugState);
    this.updateDebugBlade(probe);
    return debugState;
  }

  private collectFootprintCells(
    field: SnowField,
    center: Vector2,
    forward: Vector2,
    right: Vector2,
    width: number,
    depth: number,
  ): Array<{ column: number; row: number; weight: number }> {
    const minX = center.x - Math.abs(right.x) * width / 2 - Math.abs(forward.x) * depth / 2 - field.cellWidth;
    const maxX = center.x + Math.abs(right.x) * width / 2 + Math.abs(forward.x) * depth / 2 + field.cellWidth;
    const minZ = center.y - Math.abs(right.y) * width / 2 - Math.abs(forward.y) * depth / 2 - field.cellDepth;
    const maxZ = center.y + Math.abs(right.y) * width / 2 + Math.abs(forward.y) * depth / 2 + field.cellDepth;

    const clampedBounds = this.getClampedFieldBounds(field, minX, minZ, maxX, maxZ);
    if (!clampedBounds) {
      return [];
    }

    const cells: Array<{ column: number; row: number; weight: number }> = [];
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    for (let row = clampedBounds.minRow; row <= clampedBounds.maxRow; row += 1) {
      for (let column = clampedBounds.minColumn; column <= clampedBounds.maxColumn; column += 1) {
        const worldX = field.center.x - field.size.x / 2 + column * field.cellWidth;
        const worldZ = field.center.y - field.size.y / 2 + row * field.cellDepth;
        const deltaX = worldX - center.x;
        const deltaZ = worldZ - center.y;
        const localRight = deltaX * right.x + deltaZ * right.y;
        const localForward = deltaX * forward.x + deltaZ * forward.y;

        if (Math.abs(localRight) > halfWidth || Math.abs(localForward) > halfDepth || !field.isCellActive(column, row)) {
          continue;
        }

        // Weight cells toward the blade center so the trench and front pile read clearly.
        const widthFactor = 1 - Math.abs(localRight) / Math.max(halfWidth, 0.0001);
        const depthFactor = 1 - Math.abs(localForward) / Math.max(halfDepth, 0.0001);
        const centerBias = widthFactor * widthFactor;
        const forwardBias = Math.max(0.4, depthFactor);
        cells.push({ column, row, weight: Math.max(0.1, centerBias * forwardBias) });
      }
    }

    return cells;
  }

  private collectBladeCells(
    field: SnowField,
    center: Vector2,
    forward: Vector2,
    right: Vector2,
    bladeWidth: number,
    bladeDepth: number,
  ): Array<{ column: number; row: number; weight: number }> {
    const halfWidth = bladeWidth / 2;
    const halfDepth = bladeDepth / 2;
    const minX = center.x - Math.abs(right.x) * halfWidth - Math.abs(forward.x) * halfDepth - field.cellWidth;
    const maxX = center.x + Math.abs(right.x) * halfWidth + Math.abs(forward.x) * halfDepth + field.cellWidth;
    const minZ = center.y - Math.abs(right.y) * halfWidth - Math.abs(forward.y) * halfDepth - field.cellDepth;
    const maxZ = center.y + Math.abs(right.y) * halfWidth + Math.abs(forward.y) * halfDepth + field.cellDepth;

    const clampedBounds = this.getClampedFieldBounds(field, minX, minZ, maxX, maxZ);
    if (!clampedBounds) {
      return [];
    }

    const cells: Array<{ column: number; row: number; weight: number }> = [];
    for (let row = clampedBounds.minRow; row <= clampedBounds.maxRow; row += 1) {
      for (let column = clampedBounds.minColumn; column <= clampedBounds.maxColumn; column += 1) {
        const worldX = field.center.x - field.size.x / 2 + column * field.cellWidth;
        const worldZ = field.center.y - field.size.y / 2 + row * field.cellDepth;
        const deltaX = worldX - center.x;
        const deltaZ = worldZ - center.y;
        const localRight = deltaX * right.x + deltaZ * right.y;
        const localForward = deltaX * forward.x + deltaZ * forward.y;

        if (
          Math.abs(localRight) > halfWidth + halfDepth ||
          Math.abs(localForward) > halfDepth ||
          !field.isCellActive(column, row)
        ) {
          continue;
        }

        const clampedRight = Math.min(halfWidth, Math.max(-halfWidth, localRight));
        const deltaToSegment = Math.hypot(localRight - clampedRight, localForward);
        if (deltaToSegment > halfDepth) {
          continue;
        }

        const distanceFactor = 1 - deltaToSegment / Math.max(halfDepth, 0.0001);
        const edgeFactor = 1 - Math.abs(localRight) / Math.max(halfWidth + halfDepth, 0.0001);
        cells.push({
          column,
          row,
          weight: Math.max(0.14, distanceFactor * distanceFactor * Math.max(0.35, edgeFactor)),
        });
      }
    }

    return cells;
  }

  private getClampedFieldBounds(
    field: SnowField,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ): { minColumn: number; maxColumn: number; minRow: number; maxRow: number } | null {
    const fieldMinX = field.center.x - field.size.x / 2;
    const fieldMaxX = field.center.x + field.size.x / 2;
    const fieldMinZ = field.center.y - field.size.y / 2;
    const fieldMaxZ = field.center.y + field.size.y / 2;
    const clampedMinX = Math.max(minX, fieldMinX);
    const clampedMaxX = Math.min(maxX, fieldMaxX);
    const clampedMinZ = Math.max(minZ, fieldMinZ);
    const clampedMaxZ = Math.min(maxZ, fieldMaxZ);

    if (clampedMinX > clampedMaxX || clampedMinZ > clampedMaxZ) {
      return null;
    }

    const minCell = field.toCell(clampedMinX, clampedMinZ);
    const maxCell = field.toCell(clampedMaxX, clampedMaxZ);
    if (!minCell || !maxCell) {
      return null;
    }

    return {
      minColumn: Math.min(minCell.column, maxCell.column),
      maxColumn: Math.max(minCell.column, maxCell.column),
      minRow: Math.min(minCell.row, maxCell.row),
      maxRow: Math.max(minCell.row, maxCell.row),
    };
  }

  private collectDepositCells(
    field: SnowField,
    center: Vector2,
    forward: Vector2,
    right: Vector2,
    width: number,
    depth: number,
    profile: { lateralPower: number; longitudinalPower: number; minWeight: number },
  ): Array<{ column: number; row: number; weight: number }> {
    const footprintCells = this.collectFootprintCells(field, center, forward, right, width, depth);

    return footprintCells.map((cell) => ({
      column: cell.column,
      row: cell.row,
      weight: Math.max(profile.minWeight, Math.pow(cell.weight, profile.lateralPower) * profile.longitudinalPower),
    }));
  }

  private depositMass(
    field: SnowField,
    cells: Array<{ column: number; row: number; weight: number }>,
    amount: number,
    kernel: DepositKernel = 'default',
  ): number {
    if (amount <= 0 || cells.length === 0) {
      return 0;
    }

    const totalWeight = cells.reduce((sum, cell) => sum + cell.weight, 0);
    if (totalWeight <= 0) {
      return 0;
    }

    let deposited = 0;
    for (const cell of cells) {
      deposited += this.depositWithKernel(field, cell.column, cell.row, amount * (cell.weight / totalWeight), kernel);
    }
    return deposited;
  }

  private measureFrontPileLoad(
    field: SnowField,
    cells: Array<{ column: number; row: number; weight: number }>,
  ): number {
    if (cells.length === 0) {
      return 0;
    }

    let weightedExcess = 0;
    let peakExcess = 0;
    let totalWeight = 0;
    for (const cell of cells) {
      const index = field.cellIndex(cell.column, cell.row);
      const excess = Math.max(field.dynamicHeight[index] - 1, 0);
      weightedExcess += excess * cell.weight;
      peakExcess = Math.max(peakExcess, excess);
      totalWeight += cell.weight;
    }

    if (totalWeight <= 0) {
      return 0;
    }

    const averageExcess = weightedExcess / totalWeight;
    return averageExcess + peakExcess * 0.55;
  }

  private depositWithKernel(
    field: SnowField,
    column: number,
    row: number,
    amount: number,
    kernel: DepositKernel,
  ): number {
    if (amount <= 0) {
      return 0;
    }

    const kernelEntries =
      kernel === 'wide'
        ? [
            { columnOffset: 0, rowOffset: 0, share: 0.08 },
            { columnOffset: -1, rowOffset: 0, share: 0.08 },
            { columnOffset: 1, rowOffset: 0, share: 0.08 },
            { columnOffset: -2, rowOffset: 0, share: 0.075 },
            { columnOffset: 2, rowOffset: 0, share: 0.075 },
            { columnOffset: -3, rowOffset: 0, share: 0.07 },
            { columnOffset: 3, rowOffset: 0, share: 0.07 },
            { columnOffset: -4, rowOffset: 0, share: 0.06 },
            { columnOffset: 4, rowOffset: 0, share: 0.06 },
            { columnOffset: -5, rowOffset: 0, share: 0.05 },
            { columnOffset: 5, rowOffset: 0, share: 0.05 },
            { columnOffset: -6, rowOffset: 0, share: 0.04 },
            { columnOffset: 6, rowOffset: 0, share: 0.04 },
            { columnOffset: 0, rowOffset: -1, share: 0.035 },
            { columnOffset: 0, rowOffset: 1, share: 0.035 },
            { columnOffset: -2, rowOffset: -1, share: 0.025 },
            { columnOffset: -2, rowOffset: 1, share: 0.025 },
            { columnOffset: 2, rowOffset: -1, share: 0.025 },
            { columnOffset: 2, rowOffset: 1, share: 0.025 },
            { columnOffset: -4, rowOffset: -1, share: 0.02 },
            { columnOffset: -4, rowOffset: 1, share: 0.02 },
            { columnOffset: 4, rowOffset: -1, share: 0.02 },
            { columnOffset: 4, rowOffset: 1, share: 0.02 },
          ]
        : kernel === 'front'
          ? [
              { columnOffset: 0, rowOffset: 0, share: 0.1 },
              { columnOffset: -1, rowOffset: 0, share: 0.095 },
              { columnOffset: 1, rowOffset: 0, share: 0.095 },
              { columnOffset: -2, rowOffset: 0, share: 0.08 },
              { columnOffset: 2, rowOffset: 0, share: 0.08 },
              { columnOffset: -3, rowOffset: 0, share: 0.065 },
              { columnOffset: 3, rowOffset: 0, share: 0.065 },
              { columnOffset: 0, rowOffset: 1, share: 0.06 },
              { columnOffset: -1, rowOffset: 1, share: 0.05 },
              { columnOffset: 1, rowOffset: 1, share: 0.05 },
              { columnOffset: -2, rowOffset: 1, share: 0.04 },
              { columnOffset: 2, rowOffset: 1, share: 0.04 },
              { columnOffset: 0, rowOffset: 2, share: 0.03 },
              { columnOffset: -1, rowOffset: 2, share: 0.025 },
              { columnOffset: 1, rowOffset: 2, share: 0.025 },
            ]
        : [
            { columnOffset: 0, rowOffset: 0, share: 0.44 },
            { columnOffset: -1, rowOffset: 0, share: 0.14 },
            { columnOffset: 1, rowOffset: 0, share: 0.14 },
            { columnOffset: 0, rowOffset: -1, share: 0.14 },
            { columnOffset: 0, rowOffset: 1, share: 0.14 },
          ];

    let deposited = 0;
    for (const entry of kernelEntries) {
      const targetColumn = column + entry.columnOffset;
      const targetRow = row + entry.rowOffset;
      if (targetColumn < 0 || targetColumn >= field.columns || targetRow < 0 || targetRow >= field.rows) {
        continue;
      }

      deposited += field.addDynamicHeight(targetColumn, targetRow, amount * entry.share);
    }

    return deposited;
  }

  private removeWithKernel(field: SnowField, column: number, row: number, amount: number): number {
    if (amount <= 0) {
      return 0;
    }

    const kernel = [
      { columnOffset: 0, rowOffset: 0, share: 0.46 },
      { columnOffset: -1, rowOffset: 0, share: 0.12 },
      { columnOffset: 1, rowOffset: 0, share: 0.12 },
      { columnOffset: 0, rowOffset: -1, share: 0.12 },
      { columnOffset: 0, rowOffset: 1, share: 0.12 },
      { columnOffset: -1, rowOffset: -1, share: 0.03 },
      { columnOffset: -1, rowOffset: 1, share: 0.03 },
      { columnOffset: 1, rowOffset: -1, share: 0.03 },
      { columnOffset: 1, rowOffset: 1, share: 0.03 },
    ];

    let removed = 0;
    for (const entry of kernel) {
      const targetColumn = column + entry.columnOffset;
      const targetRow = row + entry.rowOffset;
      if (targetColumn < 0 || targetColumn >= field.columns || targetRow < 0 || targetRow >= field.rows) {
        continue;
      }

      removed += field.removeDynamicHeight(targetColumn, targetRow, amount * entry.share);
    }

    return removed;
  }

  private compactWithKernel(field: SnowField, column: number, row: number, amount: number): number {
    if (amount <= 0) {
      return 0;
    }

    const kernel = [
      { columnOffset: 0, rowOffset: 0, share: 0.32 },
      { columnOffset: -1, rowOffset: 0, share: 0.16 },
      { columnOffset: 1, rowOffset: 0, share: 0.16 },
      { columnOffset: 0, rowOffset: -1, share: 0.12 },
      { columnOffset: 0, rowOffset: 1, share: 0.12 },
      { columnOffset: -1, rowOffset: -1, share: 0.06 },
      { columnOffset: 1, rowOffset: 1, share: 0.06 },
    ];

    let removed = 0;
    for (const entry of kernel) {
      const targetColumn = column + entry.columnOffset;
      const targetRow = row + entry.rowOffset;
      if (targetColumn < 0 || targetColumn >= field.columns || targetRow < 0 || targetRow >= field.rows) {
        continue;
      }

      removed += field.removeDynamicHeight(targetColumn, targetRow, amount * entry.share);
    }

    return removed;
  }

  private updateDebugBlade(probe: BladeProbeState): void {
    const halfWidth = BLADE_WIDTH / 2;
    const halfDepth = BLADE_DEPTH / 2;
    const corners = [
      probe.center.clone().addScaledVector(probe.right, -halfWidth).addScaledVector(probe.forward, -halfDepth),
      probe.center.clone().addScaledVector(probe.right, halfWidth).addScaledVector(probe.forward, -halfDepth),
      probe.center.clone().addScaledVector(probe.right, halfWidth).addScaledVector(probe.forward, halfDepth),
      probe.center.clone().addScaledVector(probe.right, -halfWidth).addScaledVector(probe.forward, halfDepth),
    ];

    for (let index = 0; index < corners.length; index += 1) {
      this.footprintCorners[index].set(corners[index].x, 0.08, corners[index].y);
    }

    this.debugBlade.geometry.setFromPoints(this.footprintCorners);
  }
}
