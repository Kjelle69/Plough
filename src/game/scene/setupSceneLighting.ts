import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';

export function setupSceneLighting(scene: Scene): void {
  const ambientLight = new AmbientLight('#1a2332', 0.55);
  scene.add(ambientLight);

  const skyGlow = new HemisphereLight('#2b3f5d', '#0b0f17', 0.5);
  scene.add(skyGlow);

  const moonLight = new DirectionalLight('#bcd4ff', 1.15);
  moonLight.position.set(-24, 31, -12);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.width = 1024;
  moonLight.shadow.mapSize.height = 1024;
  moonLight.shadow.camera.near = 0.5;
  moonLight.shadow.camera.far = 90;
  moonLight.shadow.camera.left = -42;
  moonLight.shadow.camera.right = 42;
  moonLight.shadow.camera.top = 42;
  moonLight.shadow.camera.bottom = -42;
  scene.add(moonLight);

  const moon = new Mesh(
    new SphereGeometry(7, 24, 24),
    new MeshBasicMaterial({ color: '#dbe7ff' }),
  );
  moon.position.copy(new Vector3(-320, 172, -460));
  scene.add(moon);

  const cloudMaterial = new MeshBasicMaterial({
    color: '#8da0bc',
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const cloudPuffs = [
    {
      center: new Vector3(-240, 126, -410),
      scales: [
        { x: 36, y: 10, z: 16, dx: -26, dy: -2, dz: 10 },
        { x: 48, y: 12, z: 18, dx: 0, dy: 0, dz: 0 },
        { x: 34, y: 9, z: 15, dx: 28, dy: 1, dz: -8 },
        { x: 22, y: 7, z: 11, dx: 52, dy: -1, dz: 6 },
      ],
    },
    {
      center: new Vector3(30, 118, -340),
      scales: [
        { x: 32, y: 8, z: 14, dx: -24, dy: 1, dz: 0 },
        { x: 44, y: 11, z: 18, dx: 0, dy: 0, dz: -6 },
        { x: 30, y: 8, z: 13, dx: 24, dy: -2, dz: 8 },
        { x: 18, y: 6, z: 10, dx: 46, dy: 1, dz: -4 },
      ],
    },
    {
      center: new Vector3(260, 132, -430),
      scales: [
        { x: 28, y: 8, z: 12, dx: -20, dy: 0, dz: 6 },
        { x: 42, y: 11, z: 17, dx: 0, dy: 2, dz: 0 },
        { x: 30, y: 8, z: 13, dx: 26, dy: -1, dz: -10 },
      ],
    },
  ];

  for (const cloudData of cloudPuffs) {
    const cloud = new Group();
    cloud.position.copy(cloudData.center);

    for (const puff of cloudData.scales) {
      const cloudPiece = new Mesh(new SphereGeometry(1, 18, 18), cloudMaterial);
      cloudPiece.position.set(puff.dx, puff.dy, puff.dz);
      cloudPiece.scale.set(puff.x, puff.y, puff.z);
      cloud.add(cloudPiece);
    }

    scene.add(cloud);
  }

  scene.background = new Color('#07111c');
}
