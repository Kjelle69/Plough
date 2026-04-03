import {
  AmbientLight,
  Color,
  DirectionalLight,
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
  moonLight.position.set(-24, 38, -12);
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
  moon.position.copy(new Vector3(-320, 210, -460));
  scene.add(moon);

  scene.background = new Color('#07111c');
}
