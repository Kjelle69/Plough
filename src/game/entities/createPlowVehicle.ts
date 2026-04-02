import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

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

  const wheelGeometry = new BoxGeometry(0.45, 0.45, 0.35);
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
    wheel.castShadow = true;
    vehicle.add(wheel);
  }

  vehicle.position.y = 0.08;

  return vehicle;
}
