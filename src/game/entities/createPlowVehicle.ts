import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  SpotLight,
  Vector3,
} from 'three';

const WHEEL_RADIUS = 0.46;
const WHEEL_WIDTH = 0.48;
const WHEEL_TREAD_COUNT = 12;
const EXHAUST_STACK_HEIGHT = 1.05;
const AXLE_RADIUS = 0.08;
const AXLE_HUB_WIDTH = 0.26;

export function createPlowVehicle(): Group {
  const vehicle = new Group();
  const cabinGlassMaterial = new MeshStandardMaterial({
    color: '#365b8a',
    metalness: 0.08,
    roughness: 0.16,
    transparent: true,
    opacity: 0.62,
  });

  const body = new Mesh(
    new BoxGeometry(2.8, 1, 1.7),
    new MeshStandardMaterial({ color: '#d8632d', metalness: 0.2, roughness: 0.75 }),
  );
  body.position.y = 1.1;
  body.castShadow = true;
  vehicle.add(body);

  const cabin = new Mesh(
    new BoxGeometry(1.2, 0.85, 1.2),
    new MeshStandardMaterial({ color: '#dfe7ef', metalness: 0.15, roughness: 0.35 }),
  );
  cabin.position.set(0.2, 1.8, 0);
  cabin.castShadow = true;
  vehicle.add(cabin);

  const windshield = new Mesh(
    new BoxGeometry(0.12, 0.5, 0.9),
    cabinGlassMaterial,
  );
  windshield.position.set(0.76, 1.84, 0);
  windshield.rotation.z = MathUtils.degToRad(-10);
  vehicle.add(windshield);

  const sideWindowOffsets = [-0.53, 0.53] as const;
  for (const z of sideWindowOffsets) {
    const sideWindow = new Mesh(
      new BoxGeometry(0.86, 0.46, 0.08),
      cabinGlassMaterial,
    );
    sideWindow.position.set(0.2, 1.84, z);
    vehicle.add(sideWindow);
  }

  const rearWindow = new Mesh(
    new BoxGeometry(0.12, 0.46, 0.9),
    cabinGlassMaterial,
  );
  rearWindow.position.set(-0.36, 1.84, 0);
  rearWindow.rotation.z = MathUtils.degToRad(8);
  vehicle.add(rearWindow);

  const plow = new Mesh(
    new BoxGeometry(0.3, 0.7, 2.9),
    new MeshStandardMaterial({ color: '#62707d', metalness: 0.4, roughness: 0.5 }),
  );
  plow.position.set(2.02, 0.65, 0);
  plow.rotation.z = Math.PI / 9;
  plow.castShadow = true;
  vehicle.add(plow);
  vehicle.userData.plowBlade = plow;
  vehicle.userData.plowBaseY = plow.position.y;
  vehicle.userData.plowBaseZRotation = plow.rotation.z;

  const wheelGeometry = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 20);
  const wheelMaterial = new MeshStandardMaterial({ color: '#1d2329', roughness: 0.95 });
  const treadGeometry = new BoxGeometry(0.14, 0.06, 0.36);
  const treadMaterial = new MeshStandardMaterial({ color: '#0f1419', roughness: 0.98 });
  const axleMaterial = new MeshStandardMaterial({ color: '#313941', metalness: 0.24, roughness: 0.78 });
  const axleHubMaterial = new MeshStandardMaterial({ color: '#232a31', metalness: 0.32, roughness: 0.66 });
  const wheelVisuals: Array<{ steerPivot: Group; spinGroup: Group; steerMultiplier: number }> = [];

  const wheelOffsets = [
    [-0.85, 0.55, -0.88, -0.45],
    [-0.85, 0.55, 0.88, -0.45],
    [0.85, 0.55, -0.88, 1],
    [0.85, 0.55, 0.88, 1],
  ] as const;

  addAxleAssembly(vehicle, axleMaterial, axleHubMaterial, wheelOffsets[0][0], wheelOffsets[0][1], wheelOffsets[0][2], wheelOffsets[1][2]);
  addAxleAssembly(vehicle, axleMaterial, axleHubMaterial, wheelOffsets[2][0], wheelOffsets[2][1], wheelOffsets[2][2], wheelOffsets[3][2]);

  for (const [x, y, z, steerMultiplier] of wheelOffsets) {
    const steerPivot = new Group();
    steerPivot.position.set(x, y, z);
    vehicle.add(steerPivot);

    const spinGroup = new Group();
    steerPivot.add(spinGroup);

    const wheel = new Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    spinGroup.add(wheel);

    addWheelTreads(spinGroup, treadGeometry, treadMaterial);
    wheelVisuals.push({ steerPivot, spinGroup, steerMultiplier });
  }

  const lampGeometry = new CylinderGeometry(0.085, 0.085, 0.03, 10);
  const headlampMaterial = new MeshStandardMaterial({
    color: '#f5f1da',
    emissive: '#fff6c8',
    emissiveIntensity: 2.4,
    roughness: 0.35,
  });
  const taillightMaterial = new MeshStandardMaterial({
    color: '#6d1212',
    emissive: '#ff3a3a',
    emissiveIntensity: 2.1,
    roughness: 0.45,
  });

  const headlightOffsets = [
    [1.43, 1.35, -0.54],
    [1.43, 1.35, 0.54],
  ] as const;

  for (const [x, y, z] of headlightOffsets) {
    const lampMesh = new Mesh(lampGeometry, headlampMaterial);
    lampMesh.position.set(x, y, z);
    lampMesh.rotation.z = Math.PI / 2;
    vehicle.add(lampMesh);

    const headlight = new SpotLight('#f4f1dd', 55, 48, Math.PI / 6, 0.42, 1.3);
    headlight.position.set(x, y, z);
    headlight.castShadow = false;
    const target = new Group();
    target.position.set(x + 10, y - 0.25, z);
    vehicle.add(target);
    headlight.target = target;
    vehicle.add(headlight);
  }

  const taillightOffsets = [
    [-1.43, 1.18, -0.58],
    [-1.43, 1.18, 0.58],
  ] as const;

  for (const [x, y, z] of taillightOffsets) {
    const lampMesh = new Mesh(lampGeometry, taillightMaterial);
    lampMesh.position.set(x, y, z);
    lampMesh.rotation.z = Math.PI / 2;
    vehicle.add(lampMesh);

    const taillight = new PointLight('#ff3a3a', 1.8, 6, 2.2);
    taillight.position.set(x, y, z);
    vehicle.add(taillight);
  }

  const exhaustStack = new Mesh(
    new CylinderGeometry(0.05, 0.08, EXHAUST_STACK_HEIGHT, 14),
    new MeshStandardMaterial({ color: '#3a4047', metalness: 0.42, roughness: 0.58 }),
  );
  exhaustStack.position.set(-0.86, 2.1, -0.44);
  exhaustStack.castShadow = true;
  vehicle.add(exhaustStack);
  vehicle.userData.exhaustStack = exhaustStack;
  vehicle.userData.exhaustTipOffset = new Vector3(0, EXHAUST_STACK_HEIGHT * 0.5 + 0.02, 0);

  vehicle.position.y = 0.08;
  vehicle.userData.wheelVisuals = wheelVisuals;
  vehicle.userData.wheelRadius = WHEEL_RADIUS;

  return vehicle;
}

function addAxleAssembly(
  parent: Group,
  axleMaterial: MeshStandardMaterial,
  axleHubMaterial: MeshStandardMaterial,
  x: number,
  y: number,
  leftZ: number,
  rightZ: number,
): void {
  const axleLength = Math.abs(rightZ - leftZ);
  const axleCenterZ = (leftZ + rightZ) * 0.5;

  const axle = new Mesh(
    new CylinderGeometry(AXLE_RADIUS, AXLE_RADIUS, axleLength, 14),
    axleMaterial,
  );
  axle.position.set(x, y, axleCenterZ);
  axle.rotation.x = Math.PI / 2;
  axle.castShadow = true;
  parent.add(axle);

  const axleHub = new Mesh(
    new BoxGeometry(AXLE_HUB_WIDTH, AXLE_HUB_WIDTH, AXLE_HUB_WIDTH),
    axleHubMaterial,
  );
  axleHub.position.set(x, y, axleCenterZ);
  axleHub.castShadow = true;
  parent.add(axleHub);
}

function addWheelTreads(parent: Group, treadGeometry: BoxGeometry, treadMaterial: MeshStandardMaterial): void {
  const radialOffset = WHEEL_RADIUS - 0.01;
  const axis = new Vector3(0, 0, 1);
  const quaternion = new Quaternion();

  for (let index = 0; index < WHEEL_TREAD_COUNT; index += 1) {
    const tread = new Mesh(treadGeometry, treadMaterial);
    const angle = (index / WHEEL_TREAD_COUNT) * Math.PI * 2;
    tread.position.set(
      Math.cos(angle) * radialOffset,
      Math.sin(angle) * radialOffset,
      0,
    );
    quaternion.setFromAxisAngle(axis, angle);
    tread.setRotationFromQuaternion(quaternion);
    tread.rotation.z += MathUtils.degToRad(90);
    tread.castShadow = true;
    parent.add(tread);
  }
}
