import {
  Box3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelDefinition, ObstacleBody, RouteTarget } from '../core/types';
import type { SnowTuning } from '../core/tuning';
import { SnowField } from '../systems/SnowField';
import ploughMapUrl from '../../assets/New Folder/Plough.glb?url';

const MAP_SCALE = 1;
const SNOWFIELD_MARGIN = 4;
const SNOWFIELD_COLUMNS = 512;
const SNOWFIELD_ROWS = 512;
const LOCAL_SNOWFIELD_SIZE = 100;
const TREE_COUNT = 440;
const TERRAIN_SAMPLE_COLUMNS = 196;
const TERRAIN_SAMPLE_ROWS = 196;

interface MapLoadResult {
  scene: Group;
  terrainSampler: (worldX: number, worldZ: number) => number;
  bounds: Box3;
}

export async function createPrototypeCourse(snowTuning?: SnowTuning): Promise<LevelDefinition> {
  const root = new Group();
  const obstacles: ObstacleBody[] = [];
  const snowFields: SnowField[] = [];
  const routeTargets: RouteTarget[] = [];

  const { scene: mapScene, terrainSampler, bounds: mapBounds } = await loadMapScene();
  root.add(mapScene);

  const mapSize = mapBounds.getSize(new Vector3());
  const mapCenter = mapBounds.getCenter(new Vector3());
  const snowCenter = new Vector3(
    mapCenter.x - Math.min(mapSize.x * 0.18, 900),
    0,
    mapCenter.z + Math.min(mapSize.z * 0.08, 320),
  );
  const spawnPoint = new Vector3(
    snowCenter.x - LOCAL_SNOWFIELD_SIZE * 0.38,
    terrainSampler(snowCenter.x - LOCAL_SNOWFIELD_SIZE * 0.38, snowCenter.z) + 0.08,
    snowCenter.z,
  );

  const terrainHeightSampler = createCachedHeightSampler(
    terrainSampler,
    snowCenter,
    LOCAL_SNOWFIELD_SIZE + SNOWFIELD_MARGIN,
    LOCAL_SNOWFIELD_SIZE + SNOWFIELD_MARGIN,
    TERRAIN_SAMPLE_COLUMNS,
    TERRAIN_SAMPLE_ROWS,
  );

  const mainField = new SnowField({
    label: 'Plough Map Snowfield',
    width: LOCAL_SNOWFIELD_SIZE + SNOWFIELD_MARGIN,
    depth: LOCAL_SNOWFIELD_SIZE + SNOWFIELD_MARGIN,
    centerX: snowCenter.x,
    centerZ: snowCenter.z,
    columns: SNOWFIELD_COLUMNS,
    rows: SNOWFIELD_ROWS,
    tuning: snowTuning,
    baseHeightSampler: terrainHeightSampler,
  });
  root.add(mainField.mesh);
  snowFields.push(mainField);

  routeTargets.push({
    label: 'Map Snow Cover',
    fieldLabel: mainField.label,
    center: new Vector2(snowCenter.x, snowCenter.z),
    size: new Vector2(LOCAL_SNOWFIELD_SIZE * 0.92, LOCAL_SNOWFIELD_SIZE * 0.92),
  });

  const treeScatter = createTreeScatter(mapBounds, snowCenter, LOCAL_SNOWFIELD_SIZE, terrainSampler);
  root.add(treeScatter);

  const reset = (): void => {
    for (const field of snowFields) {
      field.reset();
    }
  };

  return { root, obstacles, snowFields, routeTargets, spawnPoint, reset };
}

async function loadMapScene(): Promise<MapLoadResult> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ploughMapUrl);
  const scene = gltf.scene;

  scene.scale.setScalar(MAP_SCALE);
  scene.updateMatrixWorld(true);

  const rawBounds = new Box3().setFromObject(scene);
  const rawCenter = rawBounds.getCenter(new Vector3());
  scene.position.set(-rawCenter.x, -rawBounds.min.y, -rawCenter.z);

  scene.traverse((node) => {
    if (!('isMesh' in node) || !node.isMesh) {
      return;
    }

    node.castShadow = true;
    node.receiveShadow = true;
  });

  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const terrainMeshes = collectTerrainMeshes(scene);
  const terrainSampler = createTerrainSampler(terrainMeshes, bounds.max.y + 250);

  return { scene, terrainSampler, bounds };
}

function collectTerrainMeshes(scene: Group): Mesh[] {
  const terrainMeshes: Mesh[] = [];

  scene.traverse((node) => {
    if (!('isMesh' in node) || !node.isMesh) {
      return;
    }

    const mesh = node as Mesh;
    const name = mesh.name.toLowerCase();
    if (name.includes('building') || name.includes('vegetation') || name.includes('forest')) {
      return;
    }

    terrainMeshes.push(mesh);
  });

  if (terrainMeshes.length > 0) {
    return terrainMeshes;
  }

  const fallbackMeshes: Mesh[] = [];
  scene.traverse((node) => {
    if ('isMesh' in node && node.isMesh) {
      fallbackMeshes.push(node as Mesh);
    }
  });

  return fallbackMeshes;
}

function createTerrainSampler(meshes: Mesh[], rayOriginY: number): (worldX: number, worldZ: number) => number {
  const raycaster = new Raycaster();
  const origin = new Vector3();
  const direction = new Vector3(0, -1, 0);

  return (worldX: number, worldZ: number): number => {
    if (meshes.length === 0) {
      return 0;
    }

    origin.set(worldX, rayOriginY, worldZ);
    raycaster.set(origin, direction);
    const intersections = raycaster.intersectObjects(meshes, false);
    return intersections[0]?.point.y ?? 0;
  };
}

function createCachedHeightSampler(
  sourceSampler: (worldX: number, worldZ: number) => number,
  center: Vector3,
  width: number,
  depth: number,
  columns: number,
  rows: number,
): (worldX: number, worldZ: number) => number {
  const heights = new Float32Array(columns * rows);
  const minX = center.x - width / 2;
  const minZ = center.z - depth / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const worldX = minX + (column / Math.max(columns - 1, 1)) * width;
      const worldZ = minZ + (row / Math.max(rows - 1, 1)) * depth;
      heights[row * columns + column] = sourceSampler(worldX, worldZ);
    }
  }

  return (worldX: number, worldZ: number): number => {
    const u = Math.min(1, Math.max(0, (worldX - minX) / width));
    const v = Math.min(1, Math.max(0, (worldZ - minZ) / depth));
    const sampleX = u * (columns - 1);
    const sampleZ = v * (rows - 1);
    const x0 = Math.floor(sampleX);
    const x1 = Math.min(columns - 1, x0 + 1);
    const z0 = Math.floor(sampleZ);
    const z1 = Math.min(rows - 1, z0 + 1);
    const tx = sampleX - x0;
    const tz = sampleZ - z0;

    const h00 = heights[z0 * columns + x0];
    const h10 = heights[z0 * columns + x1];
    const h01 = heights[z1 * columns + x0];
    const h11 = heights[z1 * columns + x1];
    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;

    return top + (bottom - top) * tz;
  };
}

function createTreeScatter(
  mapBounds: Box3,
  snowCenter: Vector3,
  snowfieldSize: number,
  terrainSampler: (worldX: number, worldZ: number) => number,
): Group {
  const group = new Group();
  const trunkMaterial = new MeshStandardMaterial({ color: '#6f4c2b', roughness: 0.92 });
  const crownMaterial = new MeshStandardMaterial({ color: '#345a34', roughness: 0.96 });
  const trunkMesh = new InstancedMesh(new CylinderGeometry(0.12, 0.18, 1.8, 6), trunkMaterial, TREE_COUNT);
  const crownMesh = new InstancedMesh(new ConeGeometry(0.9, 2.8, 8), crownMaterial, TREE_COUNT);
  const dummy = new Object3D();
  const matrix = new Matrix4();
  const exclusionHalfSize = snowfieldSize * 0.68;
  let placed = 0;
  let seed = 1337;

  while (placed < TREE_COUNT) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const randomX = seed / 0xffffffff;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const randomZ = seed / 0xffffffff;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const randomScale = seed / 0xffffffff;

    const x = mapBounds.min.x + 16 + randomX * Math.max(mapBounds.max.x - mapBounds.min.x - 32, 1);
    const z = mapBounds.min.z + 16 + randomZ * Math.max(mapBounds.max.z - mapBounds.min.z - 32, 1);

    if (
      Math.abs(x - snowCenter.x) < exclusionHalfSize &&
      Math.abs(z - snowCenter.z) < exclusionHalfSize
    ) {
      continue;
    }

    const baseY = terrainSampler(x, z);
    const scale = 0.85 + randomScale * 1.35;

    dummy.position.set(x, baseY + 0.9 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    matrix.copy(dummy.matrix);
    trunkMesh.setMatrixAt(placed, matrix);

    dummy.position.set(x, baseY + 2.55 * scale, z);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    matrix.copy(dummy.matrix);
    crownMesh.setMatrixAt(placed, matrix);

    placed += 1;
  }

  trunkMesh.count = placed;
  crownMesh.count = placed;
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  crownMesh.castShadow = true;
  crownMesh.receiveShadow = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh, crownMesh);

  return group;
}
