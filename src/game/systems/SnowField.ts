import {
  BufferAttribute,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from 'three';
import type { SnowField as SnowFieldContract, SnowFieldDebugState } from '../core/types';
import type { SnowTuning } from '../core/tuning';
import snowCoarseBaseColorUrl from '../../assets/snowcoarse/SnowTileCrisp_BaseColor.png';
import snowCoarseNormalUrl from '../../assets/snowcoarse/SnowTileCrisp_Normal.png';
import snowCoarseRoughnessUrl from '../../assets/snowcoarse/SnowTileCrisp_Roughness.png';

interface SnowFieldOptions {
  label: string;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  columns?: number;
  rows?: number;
  tuning?: SnowTuning;
  baseHeightSampler?: (worldX: number, worldZ: number) => number;
  maskSampler?: (worldX: number, worldZ: number) => boolean;
}

const BASE_HEIGHT_AMPLITUDE = 0.004;
const BASE_SNOW_HEIGHT = 1.04;
const PILE_HEIGHT_SCALE = 1.25;
const MAX_DYNAMIC_HEIGHT = 3.8;
const SNOW_TEXTURE_REPEAT = 9;
const SNOW_TEXTURE_REPEAT_PER_WORLD_UNIT = SNOW_TEXTURE_REPEAT / 100;
const NORMAL_RECOMPUTE_INTERVAL = 4;
const MASK_SMOOTHING_PASSES = 2;
const ICE_REVEAL_START = 0.18;
const ICE_TINT_R = 0.38;
const ICE_TINT_G = 0.53;
const ICE_TINT_B = 0.72;
const PACKED_SNOW_TINT_R = 0.56;
const PACKED_SNOW_TINT_G = 0.65;
const PACKED_SNOW_TINT_B = 0.76;

const textureLoader = new TextureLoader();
const snowCoarseBaseColor = textureLoader.load(snowCoarseBaseColorUrl);
const snowCoarseNormal = textureLoader.load(snowCoarseNormalUrl);
const snowCoarseRoughness = textureLoader.load(snowCoarseRoughnessUrl);

for (const texture of [snowCoarseBaseColor, snowCoarseNormal, snowCoarseRoughness]) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
}

snowCoarseBaseColor.colorSpace = SRGBColorSpace;

export class SnowField implements SnowFieldContract {
  readonly label: string;
  readonly center: Vector2;
  readonly size: Vector2;
  readonly mesh: Mesh;
  readonly baseHeight: Float32Array;
  readonly dynamicHeight: Float32Array;
  readonly columns: number;
  readonly rows: number;
  readonly totalCells: number;
  readonly cellWidth: number;
  readonly cellDepth: number;
  readonly maxDynamicHeight = MAX_DYNAMIC_HEIGHT;
  private tuning?: SnowTuning;
  private readonly baseHeightSampler?: (worldX: number, worldZ: number) => number;
  private readonly maskSampler?: (worldX: number, worldZ: number) => boolean;

  private readonly geometry: PlaneGeometry;
  private readonly colorAttribute: Float32BufferAttribute;
  private readonly positionAttribute: Float32BufferAttribute;
  private readonly activeMask: Uint8Array;
  private readonly gridCellCount: number;
  private dirty = true;
  private normalsDirty = true;
  private rendersSinceNormalRecompute = NORMAL_RECOMPUTE_INTERVAL;
  private clearedAmount = 0;
  private debugState: SnowFieldDebugState = { removedMass: 0, depositedMass: 0, affectedCells: 0, frontPileLoad: 0 };

  constructor(options: SnowFieldOptions) {
    this.label = options.label;
    this.center = new Vector2(options.centerX, options.centerZ);
    this.size = new Vector2(options.width, options.depth);
    this.columns = options.columns ?? Math.max(24, Math.round(options.width * 7));
    this.rows = options.rows ?? Math.max(16, Math.round(options.depth * 7));
    this.tuning = options.tuning;
    this.baseHeightSampler = options.baseHeightSampler;
    this.maskSampler = options.maskSampler;
    this.gridCellCount = this.columns * this.rows;
    this.cellWidth = this.size.x / (this.columns - 1);
    this.cellDepth = this.size.y / (this.rows - 1);
    this.baseHeight = new Float32Array(this.gridCellCount);
    this.dynamicHeight = new Float32Array(this.gridCellCount).fill(1);
    this.activeMask = new Uint8Array(this.gridCellCount);

    this.geometry = new PlaneGeometry(this.size.x, this.size.y, this.columns - 1, this.rows - 1);
    this.geometry.setAttribute('color', new Float32BufferAttribute(this.gridCellCount * 3, 3));
    this.initializeWorldUv();
    this.geometry.setAttribute(
      'uv1',
      new BufferAttribute((this.geometry.attributes.uv as BufferAttribute).array.slice(), 2),
    );
    this.positionAttribute = this.geometry.attributes.position as Float32BufferAttribute;
    this.colorAttribute = this.geometry.attributes.color as Float32BufferAttribute;
    this.totalCells = this.initializeActiveMask();
    this.rebuildGeometryIndex();
    this.initializeBaseHeight();

    const material = new MeshStandardMaterial({
      color: '#ffffff',
      emissive: new Color('#8fdaff'),
      emissiveIntensity: 0.06,
      map: snowCoarseBaseColor,
      normalMap: snowCoarseNormal,
      roughnessMap: snowCoarseRoughness,
      roughness: 0.96,
      metalness: 0.02,
      vertexColors: true,
    });

    this.mesh = new Mesh(this.geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(options.centerX, 0.01, options.centerZ);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.visible = this.totalCells > 0;

    this.render();
  }

  render(): void {
    if (!this.dirty) {
      return;
    }

    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = this.cellIndex(column, row);
        if (!this.isCellActive(column, row)) {
          this.positionAttribute.setZ(index, this.baseHeight[index] - 0.08);
          this.colorAttribute.setXYZ(index, 0, 0, 0);
          continue;
        }

        const base = this.baseHeight[index];
        const dynamic = Math.min(Math.max(this.dynamicHeight[index], 0), this.maxDynamicHeight);
        const trenchDepth = Math.min(Math.max(1 - dynamic, 0), 1);
        const pileAmount = Math.max(dynamic - 1, 0);
        const surfaceHeight = this.getSnowSurfaceHeight(dynamic);

        // `dynamic = 0` means blade reached road/ground level. Piles build on top of the base snow layer.
        this.positionAttribute.setZ(index, base + surfaceHeight);

        const pileFactor = Math.min(pileAmount, 2.4);
        const looseSnowRed = 0.72 - trenchDepth * 0.16 + pileFactor * 0.04;
        const looseSnowGreen = 0.79 - trenchDepth * 0.14 + pileFactor * 0.03;
        const looseSnowBlue = 0.84 - trenchDepth * 0.12 + pileFactor * 0.02;
        const packedStrength = Math.min(1, trenchDepth / 0.75);
        const packedRed = looseSnowRed + (PACKED_SNOW_TINT_R - looseSnowRed) * packedStrength;
        const packedGreen = looseSnowGreen + (PACKED_SNOW_TINT_G - looseSnowGreen) * packedStrength;
        const packedBlue = looseSnowBlue + (PACKED_SNOW_TINT_B - looseSnowBlue) * packedStrength;
        const iceReveal = Math.min(1, Math.max(0, (trenchDepth - ICE_REVEAL_START) / (1 - ICE_REVEAL_START)));
        const iceStrength = iceReveal * iceReveal;
        const red = packedRed + (ICE_TINT_R - packedRed) * iceStrength;
        const green = packedGreen + (ICE_TINT_G - packedGreen) * iceStrength;
        const blue = packedBlue + (ICE_TINT_B - packedBlue) * iceStrength;
        this.colorAttribute.setXYZ(index, red, green, blue);
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    if (this.normalsDirty && this.rendersSinceNormalRecompute >= NORMAL_RECOMPUTE_INTERVAL) {
      // Recomputing normals for the full masked grid is expensive, so only do it
      // periodically while the field is actively changing.
      this.geometry.computeVertexNormals();
      this.normalsDirty = false;
      this.rendersSinceNormalRecompute = 0;
    } else if (this.normalsDirty) {
      this.rendersSinceNormalRecompute += 1;
    }
    this.dirty = false;
  }

  reset(): void {
    this.dynamicHeight.fill(1);
    this.clearedAmount = 0;
    for (let index = 0; index < this.dynamicHeight.length; index += 1) {
      if (this.activeMask[index] === 0) {
        this.dynamicHeight[index] = 0;
      }
    }
    this.debugState = { removedMass: 0, depositedMass: 0, affectedCells: 0, frontPileLoad: 0 };
    this.dirty = true;
    this.normalsDirty = true;
    this.rendersSinceNormalRecompute = NORMAL_RECOMPUTE_INTERVAL;
    this.render();
  }

  sampleHeightAtWorld(worldX: number, worldZ: number): number {
    const cell = this.toCell(worldX, worldZ);
    if (!cell) {
      return 0;
    }
    const index = this.cellIndex(cell.column, cell.row);
    return this.baseHeight[index] + this.getSnowSurfaceHeight(this.dynamicHeight[index]);
  }

  sampleSnowDepthAtWorld(worldX: number, worldZ: number): number {
    const cell = this.toCell(worldX, worldZ);
    if (!cell) {
      return 0;
    }

    const index = this.cellIndex(cell.column, cell.row);
    return this.getSnowSurfaceHeight(this.dynamicHeight[index]);
  }

  toCell(worldX: number, worldZ: number): { column: number; row: number } | null {
    const localX = worldX - (this.center.x - this.size.x / 2);
    const localZ = worldZ - (this.center.y - this.size.y / 2);

    if (localX < 0 || localX > this.size.x || localZ < 0 || localZ > this.size.y) {
      return null;
    }

    return {
      column: Math.min(this.columns - 1, Math.max(0, Math.round(localX / this.cellWidth))),
      row: Math.min(this.rows - 1, Math.max(0, Math.round(localZ / this.cellDepth))),
    };
  }

  cellIndex(column: number, row: number): number {
    return row * this.columns + column;
  }

  isCellActive(column: number, row: number): boolean {
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) {
      return false;
    }

    return this.activeMask[this.cellIndex(column, row)] === 1;
  }

  addDynamicHeight(column: number, row: number, amount: number): number {
    if (amount <= 0 || !this.isCellActive(column, row)) {
      return 0;
    }
    const index = this.cellIndex(column, row);
    const next = Math.min(this.maxDynamicHeight, this.dynamicHeight[index] + amount);
    const added = next - this.dynamicHeight[index];
    if (added > 0) {
      this.setDynamicHeightAtIndex(index, next);
      this.dirty = true;
      this.normalsDirty = true;
    }
    return added;
  }

  removeDynamicHeight(column: number, row: number, amount: number): number {
    if (amount <= 0 || !this.isCellActive(column, row)) {
      return 0;
    }
    const index = this.cellIndex(column, row);
    const next = Math.max(0, this.dynamicHeight[index] - amount);
    const removed = this.dynamicHeight[index] - next;
    if (removed > 0) {
      this.setDynamicHeightAtIndex(index, next);
      this.dirty = true;
      this.normalsDirty = true;
    }
    return removed;
  }

  relax(passes: number, factor: number): void {
    const temp = new Float32Array(this.dynamicHeight);
    for (let pass = 0; pass < passes; pass += 1) {
      temp.set(this.dynamicHeight);
      for (let row = 1; row < this.rows - 1; row += 1) {
        for (let column = 1; column < this.columns - 1; column += 1) {
          const index = this.cellIndex(column, row);
          const center = temp[index];
          if (center <= 1.08) {
            continue;
          }

          // Let only piled snow relax outward. Trenches stay cut instead of filling back in.
          const neighbors: Array<[number, number]> = [
            [column - 1, row],
            [column + 1, row],
            [column, row - 1],
            [column, row + 1],
          ];

          for (const [neighborColumn, neighborRow] of neighbors) {
            if (!this.isCellActive(neighborColumn, neighborRow)) {
              continue;
            }

            const neighborIndex = this.cellIndex(neighborColumn, neighborRow);
            const neighbor = temp[neighborIndex];
            const slope = center - neighbor;
            if (slope <= 0.24) {
              continue;
            }

            const flow = Math.min(
              (slope - 0.24) * factor * 0.32,
              this.dynamicHeight[index] - 1,
              this.maxDynamicHeight - this.dynamicHeight[neighborIndex],
            );

            if (flow <= 0) {
              continue;
            }

            this.setDynamicHeightAtIndex(index, this.dynamicHeight[index] - flow);
            this.setDynamicHeightAtIndex(neighborIndex, this.dynamicHeight[neighborIndex] + flow);
            this.dirty = true;
            this.normalsDirty = true;
          }
        }
      }
    }
  }

  needsRender(): boolean {
    return this.dirty;
  }

  getClearFraction(): number {
    if (this.totalCells === 0) {
      return 0;
    }
    return this.clearedAmount / this.totalCells;
  }

  setDebugState(state: SnowFieldDebugState): void {
    this.debugState = state;
  }

  setTuning(tuning: SnowTuning): void {
    this.tuning = tuning;
    this.dirty = true;
    this.normalsDirty = true;
    this.rendersSinceNormalRecompute = NORMAL_RECOMPUTE_INTERVAL;
    this.render();
  }

  getDebugState(): SnowFieldDebugState {
    return this.debugState;
  }

  private initializeBaseHeight(): void {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = this.cellIndex(column, row);
        const u = column / Math.max(this.columns - 1, 1);
        const v = row / Math.max(this.rows - 1, 1);
        const worldX = this.center.x - this.size.x / 2 + column * this.cellWidth;
        const worldZ = this.center.y - this.size.y / 2 + row * this.cellDepth;
        const wave =
          Math.sin(u * Math.PI * 1.2 + v * 1.4) * 0.55 +
          Math.cos(v * Math.PI * 1.8 - u * 0.8) * 0.45;
        const sampledBase = this.baseHeightSampler ? this.baseHeightSampler(worldX, worldZ) : 0;
        this.baseHeight[index] = sampledBase + wave * BASE_HEIGHT_AMPLITUDE;
        if (this.activeMask[index] === 0) {
          this.dynamicHeight[index] = 0;
        }
      }
    }
  }

  private initializeWorldUv(): void {
    const uvAttribute = this.geometry.attributes.uv as BufferAttribute;

    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = this.cellIndex(column, row);
        const worldX = this.center.x - this.size.x / 2 + column * this.cellWidth;
        const worldZ = this.center.y - this.size.y / 2 + row * this.cellDepth;
        uvAttribute.setXY(
          index,
          worldX * SNOW_TEXTURE_REPEAT_PER_WORLD_UNIT,
          worldZ * SNOW_TEXTURE_REPEAT_PER_WORLD_UNIT,
        );
      }
    }

    uvAttribute.needsUpdate = true;
  }

  private initializeActiveMask(): number {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const worldX = this.center.x - this.size.x / 2 + column * this.cellWidth;
        const worldZ = this.center.y - this.size.y / 2 + row * this.cellDepth;
        const index = this.cellIndex(column, row);
        const active = this.maskSampler ? this.maskSampler(worldX, worldZ) : true;
        this.activeMask[index] = active ? 1 : 0;
        if (!active) {
          this.dynamicHeight[index] = 0;
        }
      }
    }

    this.smoothActiveMask();

    let activeCells = 0;
    for (let index = 0; index < this.activeMask.length; index += 1) {
      if (this.activeMask[index] === 1) {
        activeCells += 1;
      } else {
        this.dynamicHeight[index] = 0;
      }
    }

    return activeCells;
  }

  private smoothActiveMask(): void {
    if (!this.maskSampler) {
      return;
    }

    const nextMask = new Uint8Array(this.activeMask.length);

    for (let pass = 0; pass < MASK_SMOOTHING_PASSES; pass += 1) {
      nextMask.set(this.activeMask);

      for (let row = 1; row < this.rows - 1; row += 1) {
        for (let column = 1; column < this.columns - 1; column += 1) {
          const index = this.cellIndex(column, row);
          let activeNeighbors = 0;

          for (let neighborRow = row - 1; neighborRow <= row + 1; neighborRow += 1) {
            for (let neighborColumn = column - 1; neighborColumn <= column + 1; neighborColumn += 1) {
              if (neighborColumn === column && neighborRow === row) {
                continue;
              }

              if (this.activeMask[this.cellIndex(neighborColumn, neighborRow)] === 1) {
                activeNeighbors += 1;
              }
            }
          }

          if (this.activeMask[index] === 0 && activeNeighbors >= 5) {
            nextMask[index] = 1;
          } else if (this.activeMask[index] === 1 && activeNeighbors <= 1) {
            nextMask[index] = 0;
          }
        }
      }

      this.activeMask.set(nextMask);
    }
  }

  private rebuildGeometryIndex(): void {
    const indices: number[] = [];

    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let column = 0; column < this.columns - 1; column += 1) {
        const topLeft = this.cellIndex(column, row);
        const topRight = this.cellIndex(column + 1, row);
        const bottomLeft = this.cellIndex(column, row + 1);
        const bottomRight = this.cellIndex(column + 1, row + 1);

        if (
          this.activeMask[topLeft] === 1 &&
          this.activeMask[topRight] === 1 &&
          this.activeMask[bottomRight] === 1
        ) {
          indices.push(topLeft, bottomRight, topRight);
        }

        if (
          this.activeMask[topLeft] === 1 &&
          this.activeMask[bottomRight] === 1 &&
          this.activeMask[bottomLeft] === 1
        ) {
          indices.push(topLeft, bottomLeft, bottomRight);
        }
      }
    }

    this.geometry.setIndex(indices);
  }

  private setDynamicHeightAtIndex(index: number, next: number): void {
    if (this.activeMask[index] === 0) {
      this.dynamicHeight[index] = next;
      return;
    }

    const previous = this.dynamicHeight[index];
    if (previous === next) {
      return;
    }

    this.clearedAmount += this.getClearContribution(next) - this.getClearContribution(previous);
    this.dynamicHeight[index] = next;
  }

  private getClearContribution(dynamic: number): number {
    return 1 - Math.min(dynamic, 1);
  }

  private getSnowSurfaceHeight(dynamic: number): number {
    const clampedDynamic = Math.min(Math.max(dynamic, 0), this.maxDynamicHeight);
    const pileAmount = Math.max(clampedDynamic - 1, 0);
    const baseSnowHeight = this.tuning?.baseSnowHeight ?? BASE_SNOW_HEIGHT;
    const pileHeightScale = this.tuning?.pileHeightScale ?? PILE_HEIGHT_SCALE;
    return clampedDynamic <= 1 ? clampedDynamic * baseSnowHeight : baseSnowHeight + pileAmount * pileHeightScale;
  }
}
