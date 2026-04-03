import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
} from 'three';

export function createPlowVehicle(): Group {
  const vehicle = new Group();

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

  const wheelGeometry = new CylinderGeometry(0.46, 0.46, 0.34, 18);
  const wheelMaterial = new MeshStandardMaterial({ color: '#1d2329', roughness: 0.95 });

  const wheelOffsets = [
    [-0.95, 0.35, -0.82],
    [-0.95, 0.35, 0.82],
    [0.95, 0.35, -0.82],
    [0.95, 0.35, 0.82],
  ] as const;

  for (const [x, y, z] of wheelOffsets) {
    const wheel = new Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    wheel.rotation.y = Math.PI / 2;
    wheel.castShadow = true;
    vehicle.add(wheel);
  }

  const lampGeometry = new CylinderGeometry(0.085, 0.085, 0.12, 18);
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
    [1.5, 1.35, -0.54],
    [1.5, 1.35, 0.54],
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
    [-1.44, 1.18, -0.58],
    [-1.44, 1.18, 0.58],
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

  vehicle.position.y = 0.08;

  return vehicle;
}
