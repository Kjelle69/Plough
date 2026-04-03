import type { Box3, Group, Mesh, PerspectiveCamera, Vector2, Vector3 } from 'three';

export interface VehicleInputState {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  plowAngleDelta: number;
  plowLiftDelta: number;
}

export interface VehiclePhysicsState {
  speed: number;
  heading: number;
  lateralSpeed: number;
  traction: number;
  impact: number;
}

export interface ObstacleBody {
  label: string;
  bounds: Box3;
  mesh: Mesh;
}

export interface SnowFieldDebugState {
  removedMass: number;
  depositedMass: number;
  affectedCells: number;
  frontPileLoad: number;
}

export interface SnowField {
  label: string;
  center: Vector2;
  size: Vector2;
  mesh: Mesh;
  baseHeight: Float32Array;
  dynamicHeight: Float32Array;
  columns: number;
  rows: number;
  totalCells: number;
  cellWidth: number;
  cellDepth: number;
  maxDynamicHeight: number;
  render: () => void;
  reset: () => void;
  sampleHeightAtWorld: (worldX: number, worldZ: number) => number;
  sampleSnowDepthAtWorld: (worldX: number, worldZ: number) => number;
  toCell: (worldX: number, worldZ: number) => { column: number; row: number } | null;
  cellIndex: (column: number, row: number) => number;
  isCellActive: (column: number, row: number) => boolean;
  addDynamicHeight: (column: number, row: number, amount: number) => number;
  removeDynamicHeight: (column: number, row: number, amount: number) => number;
  relax: (passes: number, factor: number) => void;
  needsRender: () => boolean;
  getClearFraction: () => number;
  setDebugState: (state: SnowFieldDebugState) => void;
  getDebugState: () => SnowFieldDebugState;
}

export interface RouteTarget {
  label: string;
  fieldLabel: string;
  center: Vector2;
  size: Vector2;
}

export interface LevelDefinition {
  root: Group;
  obstacles: ObstacleBody[];
  snowFields: SnowField[];
  routeTargets: RouteTarget[];
  spawnPoint: Vector3;
  reset: () => void;
}

export interface ChaseCameraTarget {
  position: Vector3;
  heading: number;
}

export interface ChaseCameraRig {
  update(deltaSeconds: number, target: ChaseCameraTarget): void;
  snapToTarget(target: ChaseCameraTarget): void;
  orbit(deltaYaw: number, deltaPitch: number): void;
  zoom(delta: number): void;
  getDebugState(): { x: number; y: number; z: number };
  camera: PerspectiveCamera;
}

export type RunStatus = 'active' | 'complete' | 'failed';

export interface RunSnapshot {
  timeRemaining: number;
  score: number;
  clearedPercent: number;
  clearedPatches: number;
  totalPatches: number;
  status: RunStatus;
  highlightedPatch: string | null;
}
