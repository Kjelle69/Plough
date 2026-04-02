import { AmbientLight, DirectionalLight, Scene } from 'three';

export function setupSceneLighting(scene: Scene): void {
  const ambientLight = new AmbientLight('#dbe8f2', 1.7);
  scene.add(ambientLight);

  const sunLight = new DirectionalLight('#ffffff', 2.1);
  sunLight.position.set(8, 16, 6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 60;
  scene.add(sunLight);
}
