import { PerspectiveCamera, Vector3 } from 'three';
import type { ChaseCameraRig, ChaseCameraTarget } from '../core/types';

const BASE_DISTANCE = 15;
const BASE_HEIGHT = 5.2;
const LOOK_AHEAD_DISTANCE = 2.8;
const LOOK_AHEAD_HEIGHT = 1.2;
const MIN_PITCH = -0.45;
const MAX_PITCH = 0.4;
const MIN_DISTANCE = 3.6;
const MAX_DISTANCE = 280;
const DEFAULT_YAW = 0;
const DEFAULT_PITCH = 0.08;

export function createChaseCamera(camera: PerspectiveCamera): ChaseCameraRig {
  const desiredPosition = new Vector3();
  const lookTarget = new Vector3();
  const desiredOffset = new Vector3();
  let orbitYaw = DEFAULT_YAW;
  let orbitPitch = DEFAULT_PITCH;
  let orbitDistance = BASE_DISTANCE;

  const updateCamera = (target: ChaseCameraTarget, interpolationAlpha: number) => {
    const horizontalDistance = Math.cos(orbitPitch) * orbitDistance;
    desiredOffset.set(
      -Math.cos(target.heading + orbitYaw) * horizontalDistance,
      BASE_HEIGHT + Math.sin(orbitPitch) * orbitDistance,
      Math.sin(target.heading + orbitYaw) * horizontalDistance,
    );
    desiredPosition.copy(target.position).add(desiredOffset);
    camera.position.lerp(desiredPosition, interpolationAlpha);

    lookTarget.set(
      target.position.x + Math.cos(target.heading) * LOOK_AHEAD_DISTANCE,
      target.position.y + LOOK_AHEAD_HEIGHT,
      target.position.z - Math.sin(target.heading) * LOOK_AHEAD_DISTANCE,
    );
    camera.lookAt(lookTarget);
  };

  return {
    camera,
    update(deltaSeconds: number, target: ChaseCameraTarget): void {
      updateCamera(target, 1 - Math.exp(-deltaSeconds * 5.5));
    },
    snapToTarget(target: ChaseCameraTarget): void {
      updateCamera(target, 1);
    },
    orbit(deltaYaw: number, deltaPitch: number): void {
      orbitYaw += deltaYaw;
      orbitPitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, orbitPitch + deltaPitch));
    },
    zoom(delta: number): void {
      orbitDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbitDistance + delta));
    },
    getDebugState() {
      return {
        x: Number(camera.position.x.toFixed(2)),
        y: Number(camera.position.y.toFixed(2)),
        z: Number(camera.position.z.toFixed(2)),
      };
    },
  };
}
