import {
  BufferAttribute,
  Box3,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelDefinition, ObstacleBody, RouteDefinition, RouteGatePost, RouteTarget } from '../core/types';
import type { SnowTuning } from '../core/tuning';
import { resolveRouteDefinition } from '../routes/routeStorage';
import { SnowField } from '../systems/SnowField';
import { DEFAULT_WORLD_COMBO_PRESET, getWorldComboPresetById } from './worldPresets';
import ploughMapUrl from '../../assets/worlds/noulajarvi/Plough.glb?url';
import snowCoarseBaseColorUrl from '../../assets/snowcoarse/SnowTileCrisp_BaseColor.png';
import snowCoarseNormalUrl from '../../assets/snowcoarse/SnowTileCrisp_Normal.png';
import snowCoarseRoughnessUrl from '../../assets/snowcoarse/SnowTileCrisp_Roughness.png';

const MAP_SCALE = 1;
const MAP_VISUAL_Y_OFFSET = -1.2;
const SNOWFIELD_TILE_SIZE = 100;
const SNOWFIELD_SAMPLES_PER_UNIT = 3;
const STATIC_SNOW_MARGIN = 60;
const STATIC_SNOW_HEIGHT_OFFSET = 0.44;
const STATIC_SNOW_SINK = 0.55;
const STATIC_SNOW_REPEAT_PER_WORLD_UNIT = 9 / 100;
const STATIC_SNOW_MAX_SEGMENTS = 220;
const TREE_COUNT = 240;
const ROUTE_GATE_HEIGHT = 3.6;
const ROUTE_GATE_RADIUS = 0.06;
const ROUTE_GATE_REFLECTOR_RADIUS = ROUTE_GATE_RADIUS + 0.01;
const ROUTE_GATE_REFLECTOR_BAND_HEIGHT = 0.48;
const ROUTE_GATE_REFLECTOR_HEIGHT = 2.5;
const ROUTE_GATE_INSET = 0.85;
const ROUTE_GATE_MAX_LEAN_DEGREES = 10;
const TERRAIN_SAMPLE_COLUMNS_PER_UNIT = 1.5;
const TERRAIN_SAMPLE_ROWS_PER_UNIT = 1.5;
const SPAWN_MARGIN = 12;
const SPAWN_STEP = 6;

const textureLoader = new TextureLoader();
const staticSnowBaseColor = textureLoader.load(snowCoarseBaseColorUrl);
const staticSnowNormal = textureLoader.load(snowCoarseNormalUrl);
const staticSnowRoughness = textureLoader.load(snowCoarseRoughnessUrl);

for (const texture of [staticSnowBaseColor, staticSnowNormal, staticSnowRoughness]) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 1);
}

staticSnowBaseColor.colorSpace = SRGBColorSpace;

interface MapLoadResult {
  scene: Group;
  terrainSampler: (worldX: number, worldZ: number) => number;
  plowableSampler: (worldX: number, worldZ: number) => boolean;
  bounds: Box3;
}

interface PrototypeCourseOptions {
  includeRouteTargets?: boolean;
  includeRouteGates?: boolean;
}

export async function createPrototypeCourse(
  snowTuning?: SnowTuning,
  worldComboId = DEFAULT_WORLD_COMBO_PRESET.id,
  options: PrototypeCourseOptions = {},
): Promise<LevelDefinition> {
  const worldCombo = getWorldComboPresetById(worldComboId);
  const routeDefinition = resolveRouteDefinition(worldComboId);
  const root = new Group();
  const obstacles: ObstacleBody[] = [];
  const snowFields: SnowField[] = [];
  const routeTargets: RouteTarget[] = [];
  const routeGatePosts: RouteGatePost[] = [];

  const { scene: mapScene, terrainSampler, plowableSampler, bounds: mapBounds } = await loadMapScene();
  root.add(mapScene);
  root.add(createStaticSnowGround(mapBounds, terrainSampler));

  const mapCenter = mapBounds.getCenter(new Vector3());
  let fieldIndex = 0;
  for (let minX = mapBounds.min.x; minX < mapBounds.max.x; minX += SNOWFIELD_TILE_SIZE) {
    for (let minZ = mapBounds.min.z; minZ < mapBounds.max.z; minZ += SNOWFIELD_TILE_SIZE) {
      const maxX = Math.min(minX + SNOWFIELD_TILE_SIZE, mapBounds.max.x);
      const maxZ = Math.min(minZ + SNOWFIELD_TILE_SIZE, mapBounds.max.z);
      const width = maxX - minX;
      const depth = maxZ - minZ;
      const center = new Vector3(minX + width / 2, 0, minZ + depth / 2);
      const terrainHeightSampler = createCachedHeightSampler(
        terrainSampler,
        center,
        width,
        depth,
        Math.max(2, Math.round(width * TERRAIN_SAMPLE_COLUMNS_PER_UNIT) + 1),
        Math.max(2, Math.round(depth * TERRAIN_SAMPLE_ROWS_PER_UNIT) + 1),
      );

      const field = new SnowField({
        label: `${worldCombo.label} Snowfield ${fieldIndex + 1}`,
        width,
        depth,
        centerX: center.x,
        centerZ: center.z,
        columns: Math.max(2, Math.round(width * SNOWFIELD_SAMPLES_PER_UNIT) + 1),
        rows: Math.max(2, Math.round(depth * SNOWFIELD_SAMPLES_PER_UNIT) + 1),
        tuning: snowTuning,
        baseHeightSampler: terrainHeightSampler,
        maskSampler: plowableSampler,
      });

      if (field.totalCells === 0) {
        continue;
      }

      root.add(field.mesh);
      snowFields.push(field);
      fieldIndex += 1;
    }
  }

  const spawnPoint = createSpawnPoint(mapBounds, mapCenter, terrainSampler, plowableSampler, routeDefinition ?? undefined);
  const treeScatter = createTreeScatter(mapBounds, mapCenter, plowableSampler, terrainSampler);
  root.add(treeScatter);

  if (routeDefinition && routeDefinition.points.length >= 2 && options.includeRouteTargets !== false) {
    routeTargets.push(buildRouteTarget(routeDefinition));
  }

  if (routeDefinition && routeDefinition.points.length >= 2 && options.includeRouteGates !== false) {
    const routeGates = createRouteGateGroup(routeDefinition, terrainSampler);
    root.add(routeGates.group);
    routeGatePosts.push(...routeGates.posts);
  }

  const reset = (): void => {
    for (const field of snowFields) {
      field.reset();
    }
    for (const gatePost of routeGatePosts) {
      gatePost.reset();
    }
  };

  return { root, obstacles, snowFields, routeTargets, routeGatePosts, spawnPoint, reset };
}

async function loadMapScene(): Promise<MapLoadResult> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(ploughMapUrl);
  const scene = gltf.scene;

  scene.scale.setScalar(MAP_SCALE);
  scene.updateMatrixWorld(true);

  const rawBounds = new Box3().setFromObject(scene);
  const rawCenter = rawBounds.getCenter(new Vector3());
  scene.position.set(-rawCenter.x, -rawBounds.min.y + MAP_VISUAL_Y_OFFSET, -rawCenter.z);

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
  const plowableSampler = createPlowableSampler(terrainMeshes, bounds.max.y + 250);

  return { scene, terrainSampler, plowableSampler, bounds };
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

function createPlowableSampler(meshes: Mesh[], rayOriginY: number): (worldX: number, worldZ: number) => boolean {
  const raycaster = new Raycaster();
  const origin = new Vector3();
  const direction = new Vector3(0, -1, 0);

  return (worldX: number, worldZ: number): boolean => {
    if (meshes.length === 0) {
      return false;
    }

    origin.set(worldX, rayOriginY, worldZ);
    raycaster.set(origin, direction);
    return raycaster.intersectObjects(meshes, false).length > 0;
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

function createStaticSnowGround(
  mapBounds: Box3,
  terrainSampler: (worldX: number, worldZ: number) => number,
): Mesh {
  const width = mapBounds.max.x - mapBounds.min.x + STATIC_SNOW_MARGIN * 2;
  const depth = mapBounds.max.z - mapBounds.min.z + STATIC_SNOW_MARGIN * 2;
  const centerX = (mapBounds.min.x + mapBounds.max.x) / 2;
  const centerZ = (mapBounds.min.z + mapBounds.max.z) / 2;
  const segmentsX = Math.max(24, Math.min(STATIC_SNOW_MAX_SEGMENTS, Math.round(width * 0.4)));
  const segmentsZ = Math.max(24, Math.min(STATIC_SNOW_MAX_SEGMENTS, Math.round(depth * 0.4)));
  const geometry = new PlaneGeometry(width, depth, segmentsX, segmentsZ);
  const positionAttribute = geometry.attributes.position as Float32BufferAttribute;
  const uvAttribute = geometry.attributes.uv as BufferAttribute;
  const colors = new Float32Array((segmentsX + 1) * (segmentsZ + 1) * 3);
  const colorAttribute = new Float32BufferAttribute(colors, 3);

  for (let row = 0; row <= segmentsZ; row += 1) {
    for (let column = 0; column <= segmentsX; column += 1) {
      const index = row * (segmentsX + 1) + column;
      const worldX = centerX - width / 2 + (column / Math.max(segmentsX, 1)) * width;
      const worldZ = centerZ - depth / 2 + (row / Math.max(segmentsZ, 1)) * depth;
      const clampedX = Math.min(mapBounds.max.x, Math.max(mapBounds.min.x, worldX));
      const clampedZ = Math.min(mapBounds.max.z, Math.max(mapBounds.min.z, worldZ));
      const baseHeight = terrainSampler(clampedX, clampedZ);
      const wave =
        Math.sin(worldX * 0.018 + worldZ * 0.011) * 0.06 +
        Math.cos(worldZ * 0.016 - worldX * 0.009) * 0.05;

      positionAttribute.setZ(index, baseHeight + STATIC_SNOW_HEIGHT_OFFSET + wave - STATIC_SNOW_SINK);
      uvAttribute.setXY(
        index,
        worldX * STATIC_SNOW_REPEAT_PER_WORLD_UNIT,
        worldZ * STATIC_SNOW_REPEAT_PER_WORLD_UNIT,
      );
      colorAttribute.setXYZ(index, 0.76, 0.81, 0.86);
    }
  }

  geometry.setAttribute('color', colorAttribute);
  geometry.setAttribute('uv1', new BufferAttribute(uvAttribute.array.slice(), 2));
  positionAttribute.needsUpdate = true;
  uvAttribute.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    color: '#eef6ff',
    emissive: '#7ebfe0',
    emissiveIntensity: 0.035,
    map: staticSnowBaseColor,
    normalMap: staticSnowNormal,
    roughnessMap: staticSnowRoughness,
    roughness: 0.97,
    metalness: 0.02,
    vertexColors: true,
  });

  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centerX, 0, centerZ);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function createTreeScatter(
  mapBounds: Box3,
  snowCenter: Vector3,
  plowableSampler: (worldX: number, worldZ: number) => boolean,
  terrainSampler: (worldX: number, worldZ: number) => number,
): Group {
  const group = new Group();
  const trunkMaterial = new MeshStandardMaterial({ color: '#6f4c2b', roughness: 0.92 });
  const crownMaterial = new MeshStandardMaterial({ color: '#345a34', roughness: 0.96 });
  const trunkMesh = new InstancedMesh(new CylinderGeometry(0.12, 0.18, 1.8, 6), trunkMaterial, TREE_COUNT);
  const crownMesh = new InstancedMesh(new ConeGeometry(0.9, 2.8, 8), crownMaterial, TREE_COUNT);
  const dummy = new Object3D();
  const matrix = new Matrix4();
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

    if (plowableSampler(x, z) || Math.abs(z - snowCenter.z) < 18) {
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

function buildRouteTarget(routeDefinition: RouteDefinition): RouteTarget {
  return {
    label: routeDefinition.label,
    width: routeDefinition.width,
    closed: routeDefinition.closed,
    points: routeDefinition.points.map((point) => new Vector2(point.x, point.z)),
  };
}

function createRouteGateGroup(
  routeDefinition: RouteDefinition,
  terrainSampler: (worldX: number, worldZ: number) => number,
): { group: Group; posts: RouteGatePost[] } {
  const group = new Group();
  const posts: RouteGatePost[] = [];
  const postMaterial = new MeshStandardMaterial({
    color: '#d84242',
    emissive: '#b92626',
    emissiveIntensity: 0.24,
    roughness: 0.62,
  });
  const reflectorMaterial = new MeshStandardMaterial({
    color: '#f4f6f7',
    emissive: '#ffe8d2',
    emissiveIntensity: 0.5,
    roughness: 0.35,
  });
  const postGeometry = new CylinderGeometry(ROUTE_GATE_RADIUS, ROUTE_GATE_RADIUS, ROUTE_GATE_HEIGHT, 10);
  const reflectorGeometry = new CylinderGeometry(
    ROUTE_GATE_REFLECTOR_RADIUS,
    ROUTE_GATE_REFLECTOR_RADIUS,
    ROUTE_GATE_REFLECTOR_BAND_HEIGHT,
    10,
  );
  const gateSpacing = routeDefinition.gateSpacing ?? 20;
  const samples = sampleRouteGateTransforms(routeDefinition, gateSpacing);

  for (const sample of samples) {
    const halfGateWidth = Math.max(2.5, routeDefinition.width * 0.5 * ROUTE_GATE_INSET);
    const leftX = sample.position.x + sample.normal.x * halfGateWidth;
    const leftZ = sample.position.y + sample.normal.y * halfGateWidth;
    const rightX = sample.position.x - sample.normal.x * halfGateWidth;
    const rightZ = sample.position.y - sample.normal.y * halfGateWidth;

    const leftPost = createGatePost(
      `${routeDefinition.label} Gate ${sample.index + 1}L`,
      leftX,
      leftZ,
      terrainSampler,
      postGeometry,
      reflectorGeometry,
      postMaterial,
      reflectorMaterial,
    );
    const rightPost = createGatePost(
      `${routeDefinition.label} Gate ${sample.index + 1}R`,
      rightX,
      rightZ,
      terrainSampler,
      postGeometry,
      reflectorGeometry,
      postMaterial,
      reflectorMaterial,
    );

    group.add(leftPost.group, rightPost.group);
    posts.push(leftPost, rightPost);
  }

  return { group, posts };
}

function createGatePost(
  label: string,
  worldX: number,
  worldZ: number,
  terrainSampler: (worldX: number, worldZ: number) => number,
  postGeometry: CylinderGeometry,
  reflectorGeometry: CylinderGeometry,
  postMaterial: MeshStandardMaterial,
  reflectorMaterial: MeshStandardMaterial,
): RouteGatePost {
  const group = new Group();
  const baseY = terrainSampler(worldX, worldZ);
  const post = new Mesh(postGeometry, postMaterial);
  const reflector = new Mesh(reflectorGeometry, reflectorMaterial);
  const leanAngleX = MathUtils.degToRad(randomSignedRange(worldX, worldZ, 10.37, ROUTE_GATE_MAX_LEAN_DEGREES));
  const leanAngleZ = MathUtils.degToRad(randomSignedRange(worldX, worldZ, 31.91, ROUTE_GATE_MAX_LEAN_DEGREES));
  group.position.set(worldX, baseY, worldZ);
  group.rotation.x = leanAngleX;
  group.rotation.z = leanAngleZ;
  post.position.set(0, ROUTE_GATE_HEIGHT / 2, 0);
  reflector.position.set(0, ROUTE_GATE_REFLECTOR_HEIGHT, 0);
  post.castShadow = true;
  post.receiveShadow = true;
  reflector.castShadow = true;
  reflector.receiveShadow = true;
  group.add(post, reflector);
  const position = new Vector3(worldX, baseY, worldZ);
  let toppled = false;

  return {
    label,
    group,
    position,
    get toppled() {
      return toppled;
    },
    topple(direction: Vector2) {
      if (toppled) {
        return;
      }

      toppled = true;
      const normalized = direction.lengthSq() > 0.0001 ? direction.clone().normalize() : new Vector2(1, 0);
      group.rotation.x = leanAngleX + normalized.y * 1.12;
      group.rotation.z = leanAngleZ - normalized.x * 1.12;
    },
    reset() {
      toppled = false;
      group.rotation.x = leanAngleX;
      group.rotation.z = leanAngleZ;
    },
  };
}

function randomSignedRange(worldX: number, worldZ: number, seedOffset: number, maxMagnitude: number): number {
  const hash = Math.sin(worldX * 12.9898 + worldZ * 78.233 + seedOffset * 37.719) * 43758.5453;
  const normalized = hash - Math.floor(hash);
  return (normalized * 2 - 1) * maxMagnitude;
}

function sampleRouteGateTransforms(
  routeDefinition: RouteDefinition,
  gateSpacing: number,
): Array<{ index: number; position: Vector2; normal: Vector2 }> {
  const points = routeDefinition.points;
  if (points.length < 2) {
    return [];
  }

  const vectors = points.map((point) => new Vector2(point.x, point.z));
  const segmentLengths: number[] = [];
  let totalLength = 0;
  const segmentCount = routeDefinition.closed ? vectors.length : vectors.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % vectors.length;
    const length = vectors[index].distanceTo(vectors[nextIndex]);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength <= 0.001) {
    return [];
  }

  const startOffset = routeDefinition.closed ? gateSpacing * 0.5 : Math.min(gateSpacing, totalLength) * 0.5;
  const samples: Array<{ index: number; position: Vector2; normal: Vector2 }> = [];
  let sampleIndex = 0;

  for (let distance = startOffset; distance < totalLength; distance += gateSpacing) {
    const sample = samplePolylineAtDistance(vectors, routeDefinition.closed, segmentLengths, distance);
    if (sample) {
      samples.push({ index: sampleIndex, ...sample });
      sampleIndex += 1;
    }
  }

  return samples;
}

function samplePolylineAtDistance(
  points: Vector2[],
  closed: boolean,
  segmentLengths: number[],
  distance: number,
): { position: Vector2; normal: Vector2 } | null {
  let traversed = 0;
  const segmentCount = closed ? points.length : points.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const length = segmentLengths[index];
    if (length <= 0.0001) {
      continue;
    }

    if (distance <= traversed + length) {
      const t = (distance - traversed) / length;
      const position = points[index].clone().lerp(points[nextIndex], t);
      const tangent = points[nextIndex].clone().sub(points[index]).normalize();
      return {
        position,
        normal: new Vector2(-tangent.y, tangent.x),
      };
    }

    traversed += length;
  }

  return null;
}

function createSpawnPoint(
  mapBounds: Box3,
  mapCenter: Vector3,
  terrainSampler: (worldX: number, worldZ: number) => number,
  plowableSampler: (worldX: number, worldZ: number) => boolean,
  routeDefinition?: RouteDefinition,
): Vector3 {
  const routeStart = routeDefinition?.points[0];
  if (routeStart && plowableSampler(routeStart.x, routeStart.z)) {
    return new Vector3(routeStart.x, terrainSampler(routeStart.x, routeStart.z) + 0.08, routeStart.z);
  }

  for (let x = mapBounds.min.x + SPAWN_MARGIN; x <= mapBounds.max.x - SPAWN_MARGIN; x += SPAWN_STEP) {
    const zOffsets = [0, SPAWN_STEP, -SPAWN_STEP, SPAWN_STEP * 2, -SPAWN_STEP * 2];
    for (const zOffset of zOffsets) {
      const z = mapCenter.z + zOffset;
      if (!plowableSampler(x, z)) {
        continue;
      }

      return new Vector3(x, terrainSampler(x, z) + 0.08, z);
    }
  }

  return new Vector3(mapCenter.x, terrainSampler(mapCenter.x, mapCenter.z) + 0.08, mapCenter.z);
}
