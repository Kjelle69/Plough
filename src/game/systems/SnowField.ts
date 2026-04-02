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
}

const BASE_HEIGHT_AMPLITUDE = 0.004;
const BASE_SNOW_HEIGHT = 1.04;
const PILE_HEIGHT_SCALE = 1.25;
const MAX_DYNAMIC_HEIGHT = 3.8;
const SNOW_TEXTURE_REPEAT = 9;

const textureLoader = new TextureLoader();
const snowCoarseBaseColor = textureLoader.load(snowCoarseBaseColorUrl);
const snowCoarseNormal = textureLoader.load(snowCoarseNormalUrl);
const snowCoarseRoughness = textureLoader.load(snowCoarseRoughnessUrl);

for (const texture of [snowCoarseBaseColor, snowCoarseNormal, snowCoarseRoughness]) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(SNOW_TEXTURE_REPEAT, SNOW_TEXTURE_REPEAT);
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

  private readonly geometry: PlaneGeometry;
  private readonly colorAttribute: Float32BufferAttribute;
  private readonly positionAttribute: Float32BufferAttribute;
  private debugState: SnowFieldDebugState = { removedMass: 0, depositedMass: 0, affectedCells: 0, frontPileLoad: 0 };

  constructor(options: SnowFieldOptions) {
    this.label = options.label;
    this.center = new Vector2(options.centerX, options.centerZ);
    this.size = new Vector2(options.width, options.depth);
    this.columns = options.columns ?? Math.max(24, Math.round(options.width * 7));
    this.rows = options.rows ?? Math.max(16, Math.round(options.depth * 7));
    this.tuning = options.tuning;
    this.baseHeightSampler = options.baseHeightSampler;
    this.totalCells = this.columns * this.rows;
    this.cellWidth = this.size.x / (this.columns - 1);
    this.cellDepth = this.size.y / (this.rows - 1);
    this.baseHeight = new Float32Array(this.totalCells);
    this.dynamicHeight = new Float32Array(this.totalCells).fill(1);

    this.geometry = new PlaneGeometry(this.size.x, this.size.y, this.columns - 1, this.rows - 1);
    this.geometry.setAttribute('color', new Float32BufferAttribute(this.totalCells * 3, 3));
    this.geometry.setAttribute('uv1', new BufferAttribute((this.geometry.attributes.uv as BufferAttribute).array.slice(), 2));
    this.positionAttribute = this.geometry.attributes.position as Float32BufferAttribute;
    this.colorAttribute = this.geometry.attributes.color as Float32BufferAttribute;
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

    this.render();
  }

  render(): void {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const index = this.cellIndex(column, row);
        const base = this.baseHeight[index];
        const dynamic = Math.min(Math.max(this.dynamicHeight[index], 0), this.maxDynamicHeight);
        const trenchDepth = Math.min(Math.max(1 - dynamic, 0), 1);
        const pileAmount = Math.max(dynamic - 1, 0);
        const surfaceHeight = this.getSnowSurfaceHeight(dynamic);

        // `dynamic = 0` means blade reached road/ground level. Piles build on top of the base snow layer.
        this.positionAttribute.setZ(index, base + surfaceHeight);

        const pileFactor = Math.min(pileAmount, 2.4);
        const brightness = 0.7 - trenchDepth * 0.42 + pileFactor * 0.04;
        const green = 0.77 - trenchDepth * 0.36 + pileFactor * 0.03;
        const blue = 0.82 - trenchDepth * 0.28 + pileFactor * 0.02;
        this.colorAttribute.setXYZ(index, brightness, green, blue);
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  reset(): void {
    this.dynamicHeight.fill(1);
    this.debugState = { removedMass: 0, depositedMass: 0, affectedCells: 0, frontPileLoad: 0 };
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

  addDynamicHeight(column: number, row: number, amount: number): number {
    if (amount <= 0) {
      return 0;
    }
    const index = this.cellIndex(column, row);
    const next = Math.min(this.maxDynamicHeight, this.dynamicHeight[index] + amount);
    const added = next - this.dynamicHeight[index];
    this.dynamicHeight[index] = next;
    return added;
  }

  removeDynamicHeight(column: number, row: number, amount: number): number {
    if (amount <= 0) {
      return 0;
    }
    const index = this.cellIndex(column, row);
    const next = Math.max(0, this.dynamicHeight[index] - amount);
    const removed = this.dynamicHeight[index] - next;
    this.dynamicHeight[index] = next;
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

            this.dynamicHeight[index] -= flow;
            this.dynamicHeight[neighborIndex] += flow;
          }
        }
      }
    }
  }

  getClearFraction(): number {
    let removed = 0;
    for (let index = 0; index < this.dynamicHeight.length; index += 1) {
      removed += 1 - Math.min(this.dynamicHeight[index], 1);
    }
    return removed / this.totalCells;
  }

  setDebugState(state: SnowFieldDebugState): void {
    this.debugState = state;
  }

  setTuning(tuning: SnowTuning): void {
    this.tuning = tuning;
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
      }
    }
  }

  private getSnowSurfaceHeight(dynamic: number): number {
    const clampedDynamic = Math.min(Math.max(dynamic, 0), this.maxDynamicHeight);
    const pileAmount = Math.max(clampedDynamic - 1, 0);
    const baseSnowHeight = this.tuning?.baseSnowHeight ?? BASE_SNOW_HEIGHT;
    const pileHeightScale = this.tuning?.pileHeightScale ?? PILE_HEIGHT_SCALE;
    return clampedDynamic <= 1 ? clampedDynamic * baseSnowHeight : baseSnowHeight + pileAmount * pileHeightScale;
  }
}
