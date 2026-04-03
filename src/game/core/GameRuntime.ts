import { Clock, Color, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { createPlowVehicle } from '../entities/createPlowVehicle';
import { createPrototypeCourse } from '../levels/createPrototypeCourse';
import { cloneGameplayTuning, createDefaultGameplayTuning } from './tuning';
import { setupSceneLighting } from '../scene/setupSceneLighting';
import { createChaseCamera } from '../systems/ChaseCamera';
import { createFullscreenController } from '../systems/createFullscreenController';
import { GameInput } from '../systems/GameInput';
import { PlowInteractionSystem } from '../systems/PlowInteractionSystem';
import { PlowScoringSystem } from '../systems/PlowScoringSystem';
import { SnowSimulationSystem } from '../systems/SnowSimulationSystem';
import { SnowSpraySystem } from '../systems/SnowSpraySystem';
import { VehicleController } from '../systems/VehicleController';
import { DevPanel } from '../ui/DevPanel';
import { GameHud } from '../ui/GameHud';
import type { RunSnapshot, SnowField as SnowFieldContract } from './types';

interface GameRuntimeOptions {
  mountPoint: HTMLElement;
  playerName: string;
  devMode: boolean;
  onExitToMenu: () => void;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export class GameRuntime {
  private static readonly PLOW_PROBE_FORWARD_OFFSET = 1.9;
  private static readonly SNOWFIELD_INTERACTION_PADDING = 18;
  private static readonly SNOWFIELD_CONTACT_PADDING = 2.5;
  private static readonly PLOW_MAX_ANGLE = Math.PI / 4;
  private static readonly PLOW_ANGLE_SPEED = 1.35;
  private static readonly PLOW_MAX_LIFT = 1;
  private static readonly PLOW_LIFT_SPEED = 1.35;
  private static readonly PLOW_VISUAL_LIFT = 0.62;
  private static readonly PLOW_VISUAL_ANGLE_SCALE = 0.62;

  private readonly options: GameRuntimeOptions;

  private readonly scene = new Scene();

  private readonly camera = new PerspectiveCamera(60, 1, 0.1, 50000);

  private readonly chaseCamera = createChaseCamera(this.camera);

  private readonly renderer = new WebGLRenderer({ antialias: true });

  private readonly clock = new Clock();

  private readonly vehicle = createPlowVehicle();

  private readonly tuningDefaults = createDefaultGameplayTuning();

  private readonly tuning = cloneGameplayTuning(this.tuningDefaults);

  private level: Awaited<ReturnType<typeof createPrototypeCourse>> | null = null;

  private readonly input = new GameInput();

  private readonly vehicleController = new VehicleController({ tuning: this.tuning.vehicle });

  private readonly plowInteraction = new PlowInteractionSystem({ tuning: this.tuning.snow });

  private readonly snowSimulation = new SnowSimulationSystem();

  private readonly snowSpray = new SnowSpraySystem();

  private plowRun: PlowScoringSystem | null = null;

  private readonly hud = new GameHud();

  private readonly devPanel: DevPanel | null;

  private lastCollisionLabel: string | null = null;

  private runSnapshot: RunSnapshot = {
    timeRemaining: Number.POSITIVE_INFINITY,
    score: 0,
    clearedPercent: 0,
    clearedPatches: 0,
    totalPatches: 0,
    status: 'active',
    highlightedPatch: null,
  };

  private animationFrameId = 0;

  private disposed = false;

  private readonly resizeObserver = new ResizeObserver(() => this.resize());

  private readonly fullscreenController = createFullscreenController({
    element: document.documentElement,
  });

  private readonly plowProbe = new Vector2();

  private readonly sprayCenter = new Vector3();

  private frontPileLoad = 0;

  private plowAngle = 0;

  private plowLift = 0;

  private orbitingCamera = false;

  private readonly handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 2) {
      return;
    }

    this.orbitingCamera = true;
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!this.orbitingCamera) {
      return;
    }

    this.chaseCamera.orbit(-event.movementX * 0.012, -event.movementY * 0.008);
  };

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.chaseCamera.zoom(event.deltaY * 0.01);
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (event.button !== 2 || !this.orbitingCamera) {
      return;
    }

    this.orbitingCamera = false;
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'f') {
      this.fullscreenController.toggle();
    }

    if (event.key === 'Escape' && document.fullscreenElement) {
      void document.exitFullscreen();
    }

    if (event.key.toLowerCase() === 'm') {
      this.options.onExitToMenu();
    }

    if (event.key.toLowerCase() === 'r') {
      this.resetRun();
    }
  };

  constructor(options: GameRuntimeOptions) {
    this.options = options;
    this.devPanel = options.devMode
      ? new DevPanel({
          tuning: this.tuning,
          defaults: this.tuningDefaults,
        })
      : null;
    this.scene.background = new Color('#9fb8c8');

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
  }

  async mount(): Promise<void> {
    this.options.mountPoint.append(this.renderer.domElement);
    this.scene.add(this.vehicle);
    this.scene.add(this.plowInteraction.debugBlade);
    this.scene.add(this.snowSpray.points);
    this.hud.mount(this.options.mountPoint);
    this.devPanel?.mount(this.options.mountPoint);
    setupSceneLighting(this.scene);
    this.resize();
    this.resizeObserver.observe(this.options.mountPoint);
    window.addEventListener('keydown', this.handleKeydown);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.input.mount();
    this.hud.update(this.runSnapshot);
    this.level = await createPrototypeCourse(this.tuning.snow);
    if (this.disposed) {
      return;
    }
    this.plowRun = new PlowScoringSystem({
      level: this.level,
      devMode: this.options.devMode,
    });
    this.runSnapshot = this.plowRun.getSnapshot();
    this.scene.add(this.level.root);
    this.vehicle.position.copy(this.level.spawnPoint);
    this.chaseCamera.snapToTarget({
      position: this.vehicle.position,
      heading: this.vehicle.rotation.y,
    });
    this.hud.update(this.runSnapshot);
    this.installDebugHooks();
    this.startLoop();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeydown);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    this.input.dispose();
    this.renderer.dispose();
    this.hud.dispose();
    this.devPanel?.dispose();
    this.options.mountPoint.replaceChildren();
    delete window.render_game_to_text;
    delete window.advanceTime;
    delete window.__ploughTestGamepads;
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) {
        return;
      }

      const deltaSeconds = Math.min(this.clock.getDelta(), 1 / 20);
      this.update(deltaSeconds);
      this.render();
      this.animationFrameId = window.requestAnimationFrame(tick);
    };

    this.clock.start();
    tick();
  }

  private update(deltaSeconds: number): void {
    if (!this.level || !this.plowRun) {
      return;
    }

    const inputState =
      this.runSnapshot.status === 'active'
        ? this.input.readVehicleInput()
        : { steer: 0, throttle: 0, brake: 0, handbrake: true, plowAngleDelta: 0, plowLiftDelta: 0 };
    this.updatePlowControls(inputState, deltaSeconds);
    const plowContact = this.getPlowContactState();
    const vehicleCenter = new Vector2(this.vehicle.position.x, this.vehicle.position.z);
    const vehicleOnPlayableArea = this.isPointOnPlayableArea(vehicleCenter.x, vehicleCenter.y);
    const collision = this.vehicleController.update(
      deltaSeconds,
      this.vehicle,
      inputState,
      this.level.obstacles,
      {
        onSnow: plowContact.onSnow,
        offPlayableArea: !vehicleOnPlayableArea,
        plowEngaged: plowContact.onSnow && this.plowLift < 0.92,
        frontPileLoad: this.frontPileLoad,
      },
    );

    this.lastCollisionLabel = collision.blockedBy;
    const bladeForward = new Vector2(Math.cos(this.vehicle.rotation.y), -Math.sin(this.vehicle.rotation.y));
    vehicleCenter.set(this.vehicle.position.x, this.vehicle.position.z);
    const bladeCenter = new Vector2(
      this.vehicle.position.x + bladeForward.x * GameRuntime.PLOW_PROBE_FORWARD_OFFSET,
      this.vehicle.position.z + bladeForward.y * GameRuntime.PLOW_PROBE_FORWARD_OFFSET,
    );
    const nearbyFields = this.getNearbySnowFields(
      [vehicleCenter, bladeCenter],
      GameRuntime.SNOWFIELD_INTERACTION_PADDING,
    );

    let strongestFrontPileLoad = 0;
    for (const field of nearbyFields) {
      const debugState = this.plowInteraction.applyToField(
        field,
        {
          center: bladeCenter,
          forward: bladeForward,
          right: new Vector2(-bladeForward.y, bladeForward.x),
          speed: this.vehicleController.getPhysicsState().speed,
          vehicleCenter,
          vehicleForward: bladeForward,
          bladeAngle: this.plowAngle,
          bladeLift: this.plowLift,
        },
        deltaSeconds,
      );
      strongestFrontPileLoad = Math.max(strongestFrontPileLoad, debugState.frontPileLoad);
    }
    this.frontPileLoad = strongestFrontPileLoad;

    this.snowSimulation.step(nearbyFields);
    const blade = this.vehicle.userData.plowBlade;
    if (blade) {
      blade.getWorldPosition(this.sprayCenter);
    } else {
      this.sprayCenter.set(bladeCenter.x, this.vehicle.position.y + 0.35, bladeCenter.y);
    }
    this.sprayCenter.y -= 0.12;
    this.snowSpray.update({
      center: this.sprayCenter,
      forward: bladeForward,
      right: new Vector2(-bladeForward.y, bladeForward.x),
      speed: Math.abs(this.vehicleController.getPhysicsState().speed),
      plowEngaged: plowContact.onSnow && this.plowLift < 0.92,
      onSnow: plowContact.onSnow,
      deltaSeconds,
    });
    this.runSnapshot = this.plowRun.update(deltaSeconds);
    this.chaseCamera.update(deltaSeconds, {
      position: this.vehicle.position,
      heading: this.vehicle.rotation.y,
    });
    this.hud.update(this.runSnapshot);
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.options.mountPoint;
    const width = Math.max(clientWidth, 1);
    const height = Math.max(clientHeight, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private installDebugHooks(): void {
    window.render_game_to_text = () =>
      JSON.stringify({
        mode: 'game',
        playerName: this.options.playerName,
        camera: this.chaseCamera.getDebugState(),
        vehicle: {
          position: {
            x: Number(this.vehicle.position.x.toFixed(2)),
            y: Number(this.vehicle.position.y.toFixed(2)),
            z: Number(this.vehicle.position.z.toFixed(2)),
          },
          rotationY: Number(this.vehicle.rotation.y.toFixed(2)),
          speed: Number(this.vehicleController.getPhysicsState().speed.toFixed(2)),
          lateralSpeed: Number(this.vehicleController.getPhysicsState().lateralSpeed.toFixed(2)),
          traction: Number(this.vehicleController.getPhysicsState().traction.toFixed(2)),
          impact: Number(this.vehicleController.getPhysicsState().impact.toFixed(2)),
          frontPileLoad: Number(this.frontPileLoad.toFixed(2)),
          plowAngle: Number(this.plowAngle.toFixed(2)),
          plowLift: Number(this.plowLift.toFixed(2)),
        },
        input: {
          source: this.input.getActiveSource(),
        },
        collision: this.lastCollisionLabel,
        run: this.runSnapshot,
        note: 'World axes: +X east, +Y up, +Z south.',
        controls: {
          cameraOrbit: 'Hold right mouse button and drag',
          cameraZoom: 'Mouse wheel zoom',
          plowAngle: 'Q/E on keyboard or LB/RB on controller',
          plowLift: 'Z/X on keyboard or D-pad up/down on controller',
        },
      });

    window.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      const stepSeconds = ms / 1000 / steps;

      for (let index = 0; index < steps; index += 1) {
        this.update(stepSeconds);
      }

      this.render();
    };
  }

  private resetRun(): void {
    if (!this.level || !this.plowRun) {
      return;
    }

    this.vehicleController.reset();
    this.vehicle.position.copy(this.level.spawnPoint);
    this.vehicle.rotation.y = 0;
    this.lastCollisionLabel = null;
    this.frontPileLoad = 0;
    this.plowAngle = 0;
    this.plowLift = 0;
    this.snowSpray.reset();
    this.applyPlowVisualState();
    this.plowRun.reset();
    this.runSnapshot = this.plowRun.getSnapshot();
    this.chaseCamera.snapToTarget({
      position: this.vehicle.position,
      heading: this.vehicle.rotation.y,
    });
    this.hud.update(this.runSnapshot);
  }

  private updatePlowControls(
    inputState: {
      plowAngleDelta: number;
      plowLiftDelta: number;
    },
    deltaSeconds: number,
  ): void {
    this.plowAngle = this.clamp(
      this.plowAngle + inputState.plowAngleDelta * GameRuntime.PLOW_ANGLE_SPEED * deltaSeconds,
      -GameRuntime.PLOW_MAX_ANGLE,
      GameRuntime.PLOW_MAX_ANGLE,
    );
    this.plowLift = this.clamp(
      this.plowLift + inputState.plowLiftDelta * GameRuntime.PLOW_LIFT_SPEED * deltaSeconds,
      0,
      GameRuntime.PLOW_MAX_LIFT,
    );
    this.applyPlowVisualState();
  }

  private applyPlowVisualState(): void {
    const blade = this.vehicle.userData.plowBlade;
    if (!blade) {
      return;
    }

    blade.position.y = (this.vehicle.userData.plowBaseY as number) + this.plowLift * GameRuntime.PLOW_VISUAL_LIFT;
    blade.rotation.z = this.vehicle.userData.plowBaseZRotation as number;
    blade.rotation.y = -this.plowAngle * GameRuntime.PLOW_VISUAL_ANGLE_SCALE;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getPlowContactState(): { onSnow: boolean } {
    if (!this.level) {
      return { onSnow: false };
    }

    this.plowProbe.set(
      this.vehicle.position.x + Math.cos(this.vehicle.rotation.y) * GameRuntime.PLOW_PROBE_FORWARD_OFFSET,
      this.vehicle.position.z - Math.sin(this.vehicle.rotation.y) * GameRuntime.PLOW_PROBE_FORWARD_OFFSET,
    );

    for (const field of this.getNearbySnowFields([this.plowProbe], GameRuntime.SNOWFIELD_CONTACT_PADDING)) {
      const halfWidth = field.size.x / 2;
      const halfDepth = field.size.y / 2;

      if (
        this.plowProbe.x >= field.center.x - halfWidth &&
        this.plowProbe.x <= field.center.x + halfWidth &&
        this.plowProbe.y >= field.center.y - halfDepth &&
        this.plowProbe.y <= field.center.y + halfDepth &&
        field.sampleSnowDepthAtWorld(this.plowProbe.x, this.plowProbe.y) > 0.25
      ) {
        return { onSnow: true };
      }
    }

    return { onSnow: false };
  }

  private isPointOnPlayableArea(worldX: number, worldZ: number): boolean {
    if (!this.level) {
      return false;
    }

    const point = new Vector2(worldX, worldZ);
    for (const field of this.getNearbySnowFields([point], 0)) {
      const cell = field.toCell(worldX, worldZ);
      if (!cell) {
        continue;
      }

      if (field.isCellActive(cell.column, cell.row)) {
        return true;
      }
    }

    return false;
  }

  private getNearbySnowFields(points: Vector2[], padding: number): SnowFieldContract[] {
    if (!this.level) {
      return [];
    }

    return this.level.snowFields.filter((field) => {
      const halfWidth = field.size.x / 2 + padding;
      const halfDepth = field.size.y / 2 + padding;

      return points.some(
        (point) =>
          point.x >= field.center.x - halfWidth &&
          point.x <= field.center.x + halfWidth &&
          point.y >= field.center.y - halfDepth &&
          point.y <= field.center.y + halfDepth,
      );
    });
  }
}
