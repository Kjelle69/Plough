import {
  BufferGeometry,
  Clock,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createPlowVehicle } from '../entities/createPlowVehicle';
import { createPrototypeCourse } from '../levels/createPrototypeCourse';
import { resolveRouteDefinition, saveStoredRouteDefinition } from '../routes/routeStorage';
import { cloneGameplayTuning, createDefaultGameplayTuning } from './tuning';
import { setupSceneLighting } from '../scene/setupSceneLighting';
import { createChaseCamera } from '../systems/ChaseCamera';
import { createFullscreenController } from '../systems/createFullscreenController';
import { GameInput } from '../systems/GameInput';
import { ExhaustSmokeSystem } from '../systems/ExhaustSmokeSystem';
import { PlowInteractionSystem } from '../systems/PlowInteractionSystem';
import { PlowScoringSystem } from '../systems/PlowScoringSystem';
import { SnowSimulationSystem } from '../systems/SnowSimulationSystem';
import { SnowSpraySystem } from '../systems/SnowSpraySystem';
import { VehicleController } from '../systems/VehicleController';
import { VehicleAudioSystem } from '../systems/VehicleAudioSystem';
import { DevPanel } from '../ui/DevPanel';
import { GameHud } from '../ui/GameHud';
import type { RunSnapshot, SnowField as SnowFieldContract } from './types';

interface GameRuntimeOptions {
  mountPoint: HTMLElement;
  playerName: string;
  devMode: boolean;
  mode: 'play' | 'editor';
  worldComboId: string;
  worldComboLabel: string;
  onRunComplete?: (snapshot: RunSnapshot) => void;
  onExitToMenu: () => void;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

export class GameRuntime {
  private static readonly ROUTE_GATE_PENALTY = 2500;
  private static readonly ROUTE_GATE_HIT_RADIUS = 1.15;
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

  private readonly exhaustSmoke = new ExhaustSmokeSystem();

  private readonly vehicleAudio = new VehicleAudioSystem();

  private plowRun: PlowScoringSystem | null = null;

  private readonly hud = new GameHud();

  private readonly devPanel: DevPanel | null;

  private readonly editorRouteRoot = new Group();

  private readonly editorRouteLineGeometry = new BufferGeometry();

  private readonly editorRouteLine = new Line(
    this.editorRouteLineGeometry,
    new LineBasicMaterial({ color: '#ff7b7b', depthTest: false }),
  );

  private readonly editorRouteRibbonGeometry = new BufferGeometry();

  private readonly editorRouteRibbon = new Mesh(
    this.editorRouteRibbonGeometry,
    new MeshBasicMaterial({
      color: '#ff6f6f',
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    }),
  );

  private readonly editorMarkerGeometry = new SphereGeometry(0.9, 14, 14);

  private readonly editorMarkerMeshes: Mesh[] = [];

  private readonly editorRoutePoints: Vector3[] = [];

  private readonly editorRaycaster = new Raycaster();

  private readonly pointerNdc = new Vector2();

  private readonly editorCameraTarget = new Vector3();

  private readonly editorCameraDesiredPosition = new Vector3();

  private readonly editorCameraPanRight = new Vector3();

  private readonly editorCameraPanForward = new Vector3();

  private editorOverlay: HTMLDivElement | null = null;

  private editorRouteClosed = false;

  private editorRouteWidth = 14;

  private selectedEditorPointIndex = -1;

  private lastCollisionLabel: string | null = null;

  private runSnapshot: RunSnapshot = {
    timeRemaining: Number.POSITIVE_INFINITY,
    score: 0,
    elapsedSeconds: 0,
    baseScore: 0,
    completionBonus: 0,
    penaltyPoints: 0,
    pinMisses: 0,
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

  private panningCamera = false;

  private draggingEditorPointIndex = -1;

  private pointerDownPosition = new Vector2();

  private pointerMovedSinceDown = false;

  private editorCameraYaw = -0.55;

  private editorCameraPitch = -0.82;

  private editorCameraDistance = 120;

  private wheelSpinRotation = 0;
  private completionNotified = false;

  private popupRoot: HTMLDivElement | null = null;

  private readonly worldPopups: Array<{
    element: HTMLDivElement;
    worldPosition: Vector3;
    age: number;
    lifetime: number;
  }> = [];

  private readonly handleContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    this.pointerDownPosition.set(event.clientX, event.clientY);
    this.pointerMovedSinceDown = false;

    if (this.options.mode === 'editor') {
      if (event.button === 2) {
        this.orbitingCamera = true;
        this.renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      if (event.button === 1) {
        this.panningCamera = true;
        this.renderer.domElement.setPointerCapture(event.pointerId);
        return;
      }

      if (event.button === 0) {
        const markerIndex = this.getEditorMarkerIndexFromPointer(event.clientX, event.clientY);
        if (markerIndex >= 0) {
          this.selectedEditorPointIndex = markerIndex;
          this.draggingEditorPointIndex = markerIndex;
          this.renderer.domElement.setPointerCapture(event.pointerId);
          this.rebuildEditorRouteVisuals();
          this.syncEditorOverlay();
        } else {
          this.selectedEditorPointIndex = -1;
          this.rebuildEditorRouteVisuals();
          this.syncEditorOverlay();
        }
      }

      return;
    }

    if (event.button === 2) {
      this.orbitingCamera = true;
      this.renderer.domElement.setPointerCapture(event.pointerId);
    }
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (
      Math.abs(event.clientX - this.pointerDownPosition.x) > 3 ||
      Math.abs(event.clientY - this.pointerDownPosition.y) > 3
    ) {
      this.pointerMovedSinceDown = true;
    }

    if (this.options.mode === 'editor') {
      if (this.draggingEditorPointIndex >= 0) {
        const point = this.getEditorWorldPointFromPointer(event.clientX, event.clientY);
        if (point) {
          point.y += 0.12;
          this.editorRoutePoints[this.draggingEditorPointIndex].copy(point);
          this.rebuildEditorRouteVisuals();
          this.syncEditorOverlay();
        }
        return;
      }

      if (this.orbitingCamera) {
        this.editorCameraYaw -= event.movementX * 0.008;
        this.editorCameraPitch = this.clamp(this.editorCameraPitch - event.movementY * 0.005, -1.42, -0.2);
        this.snapEditorCamera();
        return;
      }

      if (this.panningCamera) {
        const panScale = Math.max(0.04, this.editorCameraDistance * 0.0024);
        this.editorCameraPanRight.set(Math.cos(this.editorCameraYaw), 0, -Math.sin(this.editorCameraYaw));
        this.editorCameraPanForward.set(Math.sin(this.editorCameraYaw), 0, Math.cos(this.editorCameraYaw));
        this.editorCameraTarget.addScaledVector(this.editorCameraPanRight, -event.movementX * panScale);
        this.editorCameraTarget.addScaledVector(this.editorCameraPanForward, event.movementY * panScale);
        this.snapEditorCamera();
      }
      return;
    }

    if (!this.orbitingCamera) {
      return;
    }

    this.chaseCamera.orbit(-event.movementX * 0.012, -event.movementY * 0.008);
  };

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    if (this.options.mode === 'editor') {
      this.editorCameraDistance = this.clamp(this.editorCameraDistance + event.deltaY * 0.05, 18, 360);
      this.snapEditorCamera();
      return;
    }

    this.chaseCamera.zoom(event.deltaY * 0.01);
  };

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.options.mode === 'editor') {
      if (event.button === 2 && this.orbitingCamera) {
        this.orbitingCamera = false;
      } else if (event.button === 1 && this.panningCamera) {
        this.panningCamera = false;
      } else if (event.button === 0 && this.draggingEditorPointIndex >= 0) {
        this.draggingEditorPointIndex = -1;
      } else if (event.button === 0 && !this.pointerMovedSinceDown) {
        this.addEditorRoutePointFromPointer(event);
      }

      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
        this.renderer.domElement.releasePointerCapture(event.pointerId);
      }
      return;
    }

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

    if (this.options.mode === 'editor') {
      if (event.key === 'Backspace') {
        event.preventDefault();
        this.removeEditorRoutePoint();
      }

      if (event.key.toLowerCase() === 'c') {
        this.clearEditorRoute();
      }

      if (event.key.toLowerCase() === 'l') {
        this.toggleEditorRouteLoop();
      }

      if (event.key === '[') {
        this.adjustEditorRouteWidth(-1);
      }

      if (event.key === ']') {
        this.adjustEditorRouteWidth(1);
      }

      if (event.key === 'Enter') {
        void this.exportEditorRoute();
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.saveEditorRoute();
      }

      return;
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
    if (this.options.mode === 'play') {
      this.scene.add(this.vehicle);
      this.scene.add(this.plowInteraction.debugBlade);
      this.scene.add(this.snowSpray.points);
      this.scene.add(this.exhaustSmoke.points);
      this.hud.mount(this.options.mountPoint);
      this.mountWorldPopupRoot();
      this.devPanel?.mount(this.options.mountPoint);
      this.vehicleAudio.mount(window);
    } else {
      this.scene.add(this.editorRouteRoot);
      this.editorRouteRoot.add(this.editorRouteRibbon, this.editorRouteLine);
      this.mountEditorOverlay();
    }
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
    if (this.options.mode === 'play') {
      this.input.mount();
      this.hud.update(this.runSnapshot);
    }
    this.level = await createPrototypeCourse(this.tuning.snow, this.options.worldComboId, {
      includeRouteTargets: this.options.mode === 'play',
      includeRouteGates: this.options.mode === 'play',
    });
    if (this.disposed) {
      return;
    }
    this.scene.add(this.level.root);
    if (this.options.mode === 'play') {
      this.plowRun = new PlowScoringSystem({
        level: this.level,
        devMode: this.options.devMode,
      });
      this.runSnapshot = this.plowRun.getSnapshot();
      this.vehicle.position.copy(this.level.spawnPoint);
      this.chaseCamera.snapToTarget({
        position: this.vehicle.position,
        heading: this.vehicle.rotation.y,
      });
      this.hud.update(this.runSnapshot);
    } else {
      this.initializeEditorCamera();
      this.loadEditorRouteFromPreset();
      this.syncEditorOverlay();
    }
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
    if (this.options.mode === 'play') {
      this.input.dispose();
    }
    this.renderer.dispose();
    this.hud.dispose();
    this.devPanel?.dispose();
    this.vehicleAudio.dispose();
    this.popupRoot?.remove();
    this.editorOverlay?.remove();
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
    if (!this.level) {
      return;
    }

    if (this.options.mode === 'editor') {
      return;
    }

    if (!this.plowRun) {
      return;
    }

    const inputState =
      this.runSnapshot.status === 'active'
        ? this.input.readVehicleInput(deltaSeconds)
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
    const exhaustStack = this.vehicle.userData.exhaustStack as Mesh | undefined;
    if (exhaustStack) {
      exhaustStack.getWorldPosition(this.sprayCenter);
      const exhaustTipOffset = this.vehicle.userData.exhaustTipOffset as Vector3 | undefined;
      if (exhaustTipOffset) {
        this.sprayCenter.add(exhaustTipOffset);
      }
    } else {
      this.sprayCenter.set(this.vehicle.position.x - 0.36, this.vehicle.position.y + 2.25, this.vehicle.position.z - 0.44);
    }
    const heavyLoadFactor = Math.max(
      0,
      inputState.throttle * 0.55 +
      this.frontPileLoad * 0.45 +
      (vehicleOnPlayableArea ? 0 : 0.22) -
      Math.abs(this.vehicleController.getPhysicsState().speed) * 0.04,
    );
    this.exhaustSmoke.update({
      center: this.sprayCenter,
      forward: new Vector3(Math.cos(this.vehicle.rotation.y), 0, -Math.sin(this.vehicle.rotation.y)),
      intensity: Math.min(1, heavyLoadFactor),
      deltaSeconds,
    });
    this.vehicleAudio.update({
      speed: this.vehicleController.getPhysicsState().speed,
      throttle: Math.max(0, inputState.throttle),
      frontPileLoad: this.frontPileLoad,
      plowEngaged: plowContact.onSnow && this.plowLift < 0.92,
      onSnow: plowContact.onSnow,
      offPlayableArea: !vehicleOnPlayableArea,
    });
    this.updateRouteGateHits(bladeCenter);
    this.updateVehicleWheelVisuals(deltaSeconds, inputState.steer);
    this.runSnapshot = this.plowRun.update(deltaSeconds);
    if (this.runSnapshot.status === 'complete' && !this.completionNotified) {
      this.completionNotified = true;
      this.options.onRunComplete?.(this.runSnapshot);
    }
    this.chaseCamera.update(deltaSeconds, {
      position: this.vehicle.position,
      heading: this.vehicle.rotation.y,
    });
    this.updateWorldPopups(deltaSeconds);
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

  private mountWorldPopupRoot(): void {
    const popupRoot = document.createElement('div');
    popupRoot.className = 'world-popup-root';
    this.options.mountPoint.append(popupRoot);
    this.popupRoot = popupRoot;
  }

  private updateWorldPopups(deltaSeconds: number): void {
    if (!this.popupRoot) {
      return;
    }

    for (let index = this.worldPopups.length - 1; index >= 0; index -= 1) {
      const popup = this.worldPopups[index];
      popup.age += deltaSeconds;
      const progress = popup.age / popup.lifetime;
      if (progress >= 1) {
        popup.element.remove();
        this.worldPopups.splice(index, 1);
        continue;
      }

      const projected = popup.worldPosition.clone();
      projected.y += progress * 2.2;
      projected.project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
      const y = (-projected.y * 0.5 + 0.5) * this.renderer.domElement.clientHeight;
      popup.element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      popup.element.style.opacity = String(1 - progress);
    }
  }

  private spawnPenaltyPopup(worldPosition: Vector3, text: string): void {
    if (!this.popupRoot) {
      return;
    }

    const element = document.createElement('div');
    element.className = 'world-popup world-popup-negative';
    element.textContent = text;
    this.popupRoot.append(element);
    this.worldPopups.push({
      element,
      worldPosition: worldPosition.clone().add(new Vector3(0, 3.1, 0)),
      age: 0,
      lifetime: 1.1,
    });
  }

  private clearWorldPopups(): void {
    for (const popup of this.worldPopups) {
      popup.element.remove();
    }
    this.worldPopups.length = 0;
  }

  private updateRouteGateHits(bladeCenter: Vector2): void {
    if (!this.level || !this.plowRun || this.level.routeGatePosts.length === 0) {
      return;
    }

    const vehicleCenter = new Vector2(this.vehicle.position.x, this.vehicle.position.z);
    for (const gatePost of this.level.routeGatePosts) {
      if (gatePost.toppled) {
        continue;
      }

      const gatePosition = new Vector2(gatePost.position.x, gatePost.position.z);
      const vehicleDistance = gatePosition.distanceTo(vehicleCenter);
      const bladeDistance = gatePosition.distanceTo(bladeCenter);
      if (
        vehicleDistance > GameRuntime.ROUTE_GATE_HIT_RADIUS &&
        bladeDistance > GameRuntime.ROUTE_GATE_HIT_RADIUS
      ) {
        continue;
      }

      const hitSource = vehicleDistance <= bladeDistance ? vehicleCenter : bladeCenter;
      gatePost.topple(gatePosition.clone().sub(hitSource));
      this.plowRun.applyPenalty(GameRuntime.ROUTE_GATE_PENALTY, gatePost.label);
      this.vehicleAudio.playPenaltyTone();
      this.spawnPenaltyPopup(gatePost.position, '-2500');
    }
  }

  private installDebugHooks(): void {
    window.render_game_to_text = () =>
      JSON.stringify({
        mode: 'game',
        runtimeMode: this.options.mode,
        worldCombo: {
          id: this.options.worldComboId,
          label: this.options.worldComboLabel,
        },
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
        editorRoute: {
          pointCount: this.editorRoutePoints.length,
          closed: this.editorRouteClosed,
          width: Number(this.editorRouteWidth.toFixed(2)),
          selectedPointIndex: this.selectedEditorPointIndex,
          points: this.editorRoutePoints.map((point) => ({
            x: Number(point.x.toFixed(2)),
            y: Number(point.y.toFixed(2)),
            z: Number(point.z.toFixed(2)),
          })),
        },
        note: 'World axes: +X east, +Y up, +Z south.',
        controls: {
          cameraOrbit: 'Hold right mouse button and drag',
          cameraZoom: 'Mouse wheel zoom',
          cameraPan: this.options.mode === 'editor' ? 'Hold middle mouse button and drag' : undefined,
          editorAddPoint: this.options.mode === 'editor' ? 'Left click on the snow surface' : undefined,
          editorUndo: this.options.mode === 'editor' ? 'Backspace removes the last point' : undefined,
          editorClear: this.options.mode === 'editor' ? 'C clears the route' : undefined,
          editorLoop: this.options.mode === 'editor' ? 'L toggles closed loop' : undefined,
          editorWidth: this.options.mode === 'editor' ? '[ and ] adjust route width' : undefined,
          editorExport: this.options.mode === 'editor' ? 'Enter copies route JSON to the clipboard' : undefined,
          plowAngle: this.options.mode === 'play' ? 'Q/E on keyboard or LB/RB on controller' : undefined,
          plowLift: this.options.mode === 'play' ? 'Z/X on keyboard or D-pad up/down on controller' : undefined,
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
    this.wheelSpinRotation = 0;
    this.completionNotified = false;
    this.snowSpray.reset();
    this.exhaustSmoke.reset();
    this.level.reset();
    this.clearWorldPopups();
    this.applyPlowVisualState();
    this.updateVehicleWheelVisuals(0, 0);
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

  private initializeEditorCamera(): void {
    if (!this.level || this.level.snowFields.length === 0) {
      this.editorCameraTarget.set(0, 0, 0);
      this.snapEditorCamera();
      return;
    }

    const averageCenter = new Vector3();
    for (const field of this.level.snowFields) {
      averageCenter.x += field.center.x;
      averageCenter.z += field.center.y;
    }
    averageCenter.divideScalar(this.level.snowFields.length);
    averageCenter.y = this.level.spawnPoint.y;
    this.editorCameraTarget.copy(averageCenter);
    this.snapEditorCamera();
  }

  private snapEditorCamera(): void {
    const horizontalDistance = Math.cos(this.editorCameraPitch) * this.editorCameraDistance;
    this.editorCameraDesiredPosition.set(
      this.editorCameraTarget.x + Math.cos(this.editorCameraYaw) * horizontalDistance,
      this.editorCameraTarget.y - Math.sin(this.editorCameraPitch) * this.editorCameraDistance,
      this.editorCameraTarget.z + Math.sin(this.editorCameraYaw) * horizontalDistance,
    );
    this.camera.position.copy(this.editorCameraDesiredPosition);
    this.camera.lookAt(this.editorCameraTarget);
  }

  private mountEditorOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'editor-runtime-overlay';
    overlay.innerHTML = `
      <div class="editor-runtime-card">
        <strong>Route tools</strong>
        <span id="editor-point-count">0 points</span>
        <span id="editor-route-width">Width 14.0 m</span>
        <span id="editor-route-loop">Open route</span>
        <span id="editor-selected-point">No point selected</span>
      </div>
      <div class="editor-runtime-card">
        <strong>Controls</strong>
        <span>Left click: add point</span>
        <span>Drag point: move point</span>
        <span>MMB drag: pan</span>
        <span>RMB drag: orbit</span>
        <span>Wheel: zoom</span>
        <span>Backspace: undo</span>
        <span>C: clear</span>
        <span>L: toggle loop</span>
        <span>[ / ]: route width</span>
        <span>S: save route</span>
        <span>Enter: export JSON</span>
      </div>
      <div class="editor-runtime-card">
        <strong>Status</strong>
        <span id="editor-status-message">Route editor ready</span>
      </div>
      <div class="editor-runtime-card editor-runtime-actions">
        <button type="button" id="editor-save-route" class="secondary-button">Save Route</button>
        <button type="button" id="editor-copy-route" class="secondary-button">Copy JSON</button>
      </div>
    `;
    this.options.mountPoint.append(overlay);
    const saveButton = overlay.querySelector<HTMLButtonElement>('#editor-save-route');
    const copyButton = overlay.querySelector<HTMLButtonElement>('#editor-copy-route');
    saveButton?.addEventListener('click', () => this.saveEditorRoute());
    copyButton?.addEventListener('click', () => {
      void this.exportEditorRoute();
    });
    this.editorOverlay = overlay;
  }

  private syncEditorOverlay(message?: string): void {
    if (!this.editorOverlay) {
      return;
    }

    const pointCount = this.editorOverlay.querySelector<HTMLElement>('#editor-point-count');
    const routeWidth = this.editorOverlay.querySelector<HTMLElement>('#editor-route-width');
    const routeLoop = this.editorOverlay.querySelector<HTMLElement>('#editor-route-loop');
    const selectedPoint = this.editorOverlay.querySelector<HTMLElement>('#editor-selected-point');
    const statusMessage = this.editorOverlay.querySelector<HTMLElement>('#editor-status-message');
    if (pointCount) {
      pointCount.textContent = `${this.editorRoutePoints.length} point${this.editorRoutePoints.length === 1 ? '' : 's'}`;
    }
    if (routeWidth) {
      routeWidth.textContent = `Width ${this.editorRouteWidth.toFixed(1)} m`;
    }
    if (routeLoop) {
      routeLoop.textContent = this.editorRouteClosed ? 'Closed loop' : 'Open route';
    }
    if (selectedPoint) {
      selectedPoint.textContent =
        this.selectedEditorPointIndex >= 0 ? `Selected point ${this.selectedEditorPointIndex + 1}` : 'No point selected';
    }

    if (statusMessage) {
      statusMessage.textContent = message ?? 'Route editor ready';
    }
  }

  private addEditorRoutePointFromPointer(event: PointerEvent): void {
    if (!this.level) {
      return;
    }

    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      -(((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
    );
    this.editorRaycaster.setFromCamera(this.pointerNdc, this.camera);
    const intersections = this.editorRaycaster.intersectObjects(this.level.snowFields.map((field) => field.mesh), false);
    const hit = intersections[0];
    if (!hit) {
      return;
    }

    const point = hit.point.clone();
    point.y += 0.12;
    this.editorRoutePoints.push(point);
    this.selectedEditorPointIndex = this.editorRoutePoints.length - 1;
    this.rebuildEditorRouteVisuals();
    this.syncEditorOverlay('Point added');
  }

  private removeEditorRoutePoint(): void {
    if (this.editorRoutePoints.length === 0 && !this.editorRouteClosed) {
      return;
    }

    if (this.selectedEditorPointIndex >= 0) {
      this.editorRoutePoints.splice(this.selectedEditorPointIndex, 1);
      this.selectedEditorPointIndex = Math.min(this.selectedEditorPointIndex, this.editorRoutePoints.length - 1);
    } else {
      this.editorRoutePoints.pop();
    }

    this.rebuildEditorRouteVisuals();
    this.syncEditorOverlay('Point removed');
  }

  private clearEditorRoute(): void {
    if (this.editorRoutePoints.length === 0) {
      return;
    }

    this.editorRoutePoints.length = 0;
    this.selectedEditorPointIndex = -1;
    this.editorRouteClosed = false;
    this.rebuildEditorRouteVisuals();
    this.syncEditorOverlay('Route cleared');
  }

  private rebuildEditorRouteVisuals(): void {
    const linePoints =
      this.editorRouteClosed && this.editorRoutePoints.length >= 3
        ? [...this.editorRoutePoints, this.editorRoutePoints[0]]
        : this.editorRoutePoints;
    this.editorRouteLineGeometry.setFromPoints(linePoints);

    const ribbonPositions = this.buildEditorRouteRibbonPositions();
    if (ribbonPositions.length >= 9) {
      this.editorRouteRibbonGeometry.setAttribute('position', new Float32BufferAttribute(ribbonPositions, 3));
      this.editorRouteRibbonGeometry.computeVertexNormals();
    } else {
      this.editorRouteRibbonGeometry.setAttribute('position', new Float32BufferAttribute([], 3));
    }

    while (this.editorMarkerMeshes.length > this.editorRoutePoints.length) {
      const marker = this.editorMarkerMeshes.pop();
      marker?.removeFromParent();
    }

    for (let index = 0; index < this.editorRoutePoints.length; index += 1) {
      let marker = this.editorMarkerMeshes[index];
      if (!marker) {
        marker = new Mesh(this.editorMarkerGeometry, new MeshBasicMaterial({ color: '#ff5e5e', depthTest: false }));
        this.editorMarkerMeshes.push(marker);
        this.editorRouteRoot.add(marker);
      }

      marker.position.copy(this.editorRoutePoints[index]);
      marker.scale.setScalar(index === this.selectedEditorPointIndex ? 1.35 : 1);
      ((marker.material as MeshBasicMaterial).color).set(index === this.selectedEditorPointIndex ? '#ffd36f' : '#ff5e5e');
    }
  }

  private async exportEditorRoute(): Promise<void> {
    const payload = this.buildCurrentRouteDefinition();
    const serialized = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(serialized);
      this.syncEditorOverlay('Route copied to clipboard');
    } catch {
      console.log(serialized);
      this.syncEditorOverlay('Route JSON written to console');
    }
  }

  private loadEditorRouteFromPreset(): void {
    const routeDefinition = resolveRouteDefinition(this.options.worldComboId);
    if (!routeDefinition) {
      return;
    }

    this.editorRoutePoints.length = 0;
    for (const point of routeDefinition.points) {
      this.editorRoutePoints.push(new Vector3(point.x, point.y + 0.12, point.z));
    }
    this.editorRouteClosed = routeDefinition.closed;
    this.editorRouteWidth = routeDefinition.width;
    this.selectedEditorPointIndex = -1;
    this.rebuildEditorRouteVisuals();
  }

  private saveEditorRoute(): void {
    saveStoredRouteDefinition(this.buildCurrentRouteDefinition());
    this.syncEditorOverlay('Route saved to browser storage');
  }

  private buildCurrentRouteDefinition() {
    return {
      worldComboId: this.options.worldComboId,
      label: `${this.options.worldComboLabel} Route`,
      closed: this.editorRouteClosed,
      width: Number(this.editorRouteWidth.toFixed(2)),
      gateSpacing: 20,
      points: this.editorRoutePoints.map((point) => ({
        x: Number(point.x.toFixed(2)),
        y: Number(point.y.toFixed(2)),
        z: Number(point.z.toFixed(2)),
      })),
    };
  }

  private updateVehicleWheelVisuals(deltaSeconds: number, steerInput: number): void {
    const wheelVisuals = this.vehicle.userData.wheelVisuals as
      | Array<{ steerPivot: Group; spinGroup: Group; steerMultiplier: number }>
      | undefined;
    const wheelRadius = (this.vehicle.userData.wheelRadius as number | undefined) ?? 0.46;
    if (!wheelVisuals || wheelVisuals.length === 0) {
      return;
    }

    const speed = this.vehicleController.getPhysicsState().speed;
    const speedRatio = Math.min(Math.abs(speed) / 8, 1);
    const frontSteer = steerInput * 0.58 * (0.42 + (1 - speedRatio) * 0.58);
    const rearSteer = -steerInput * 0.24 * Math.max(0.18, 1 - speedRatio * 0.9);
    this.wheelSpinRotation -= (speed / Math.max(wheelRadius, 0.01)) * deltaSeconds;

    for (const wheelVisual of wheelVisuals) {
      const steerAngle = -(wheelVisual.steerMultiplier > 0 ? frontSteer : rearSteer);
      wheelVisual.steerPivot.rotation.y = steerAngle;
      wheelVisual.spinGroup.rotation.z = this.wheelSpinRotation;
    }
  }

  private toggleEditorRouteLoop(): void {
    if (this.editorRoutePoints.length < 3) {
      this.syncEditorOverlay('Need at least 3 points to close a loop');
      return;
    }

    this.editorRouteClosed = !this.editorRouteClosed;
    this.rebuildEditorRouteVisuals();
    this.syncEditorOverlay(this.editorRouteClosed ? 'Route closed into a loop' : 'Route opened');
  }

  private adjustEditorRouteWidth(delta: number): void {
    this.editorRouteWidth = this.clamp(this.editorRouteWidth + delta, 4, 40);
    this.rebuildEditorRouteVisuals();
    this.syncEditorOverlay('Route width adjusted');
  }

  private getEditorMarkerIndexFromPointer(clientX: number, clientY: number): number {
    if (this.editorMarkerMeshes.length === 0) {
      return -1;
    }

    this.setPointerNdc(clientX, clientY);
    this.editorRaycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.editorRaycaster.intersectObjects(this.editorMarkerMeshes, false);
    if (hits.length === 0) {
      return -1;
    }

    return this.editorMarkerMeshes.indexOf(hits[0].object as Mesh);
  }

  private getEditorWorldPointFromPointer(clientX: number, clientY: number): Vector3 | null {
    if (!this.level) {
      return null;
    }

    this.setPointerNdc(clientX, clientY);
    this.editorRaycaster.setFromCamera(this.pointerNdc, this.camera);
    const intersections = this.editorRaycaster.intersectObjects(this.level.snowFields.map((field) => field.mesh), false);
    return intersections[0]?.point.clone() ?? null;
  }

  private setPointerNdc(clientX: number, clientY: number): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      -(((clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 - 1),
    );
  }

  private buildEditorRouteRibbonPositions(): number[] {
    if (this.editorRoutePoints.length < 2) {
      return [];
    }

    const points = this.editorRoutePoints;
    const halfWidth = this.editorRouteWidth / 2;
    const leftOffsets: Vector3[] = [];
    const rightOffsets: Vector3[] = [];

    for (let index = 0; index < points.length; index += 1) {
      const previousIndex = index === 0 ? (this.editorRouteClosed ? points.length - 1 : 0) : index - 1;
      const nextIndex = index === points.length - 1 ? (this.editorRouteClosed ? 0 : points.length - 1) : index + 1;
      const previousPoint = points[previousIndex];
      const nextPoint = points[nextIndex];
      const tangent = nextPoint.clone().sub(previousPoint);

      if (tangent.lengthSq() < 0.0001) {
        tangent.set(1, 0, 0);
      }

      tangent.y = 0;
      tangent.normalize();

      const normal = new Vector3(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
      leftOffsets.push(points[index].clone().add(normal));
      rightOffsets.push(points[index].clone().sub(normal));
    }

    const positions: number[] = [];
    const segmentCount = this.editorRouteClosed ? points.length : points.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const nextIndex = (index + 1) % points.length;
      const leftA = leftOffsets[index];
      const rightA = rightOffsets[index];
      const leftB = leftOffsets[nextIndex];
      const rightB = rightOffsets[nextIndex];

      positions.push(
        leftA.x, leftA.y, leftA.z,
        rightA.x, rightA.y, rightA.z,
        leftB.x, leftB.y, leftB.z,
        leftB.x, leftB.y, leftB.z,
        rightA.x, rightA.y, rightA.z,
        rightB.x, rightB.y, rightB.z,
      );
    }

    return positions;
  }
}
