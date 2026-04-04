import { Box3, Vector3 } from 'three';
import type { ObstacleBody, VehicleInputState, VehiclePhysicsState } from '../core/types';
import type { VehicleTuning } from '../core/tuning';

interface VehicleControllerOptions {
  collisionPadding?: number;
  tuning?: VehicleTuning;
}

const FORWARD = new Vector3(1, 0, 0);
const HALF_EXTENTS = new Vector3(1.75, 1.15, 1.4);
const UP_AXIS = new Vector3(0, 1, 0);
const STEERING_WHEELBASE = 2.45;
const MAX_FRONT_STEER_ANGLE = 0.58;
const MAX_REAR_STEER_ANGLE = 0.24;

interface VehicleControllerModifiers {
  onSnow: boolean;
  offPlayableArea: boolean;
  plowEngaged: boolean;
  frontPileLoad: number;
}

export class VehicleController {
  private readonly collisionPadding: number;

  private readonly vehicleBounds = new Box3();

  private readonly lastSafePosition = new Vector3();

  private readonly forwardDirection = new Vector3();

  private readonly nextPosition = new Vector3();

  private readonly paddedBounds = new Box3();

  private readonly velocity = new Vector3();

  private readonly safeVelocity = new Vector3();

  private readonly forwardVelocity = new Vector3();

  private readonly lateralVelocity = new Vector3();

  private readonly physicsState: VehiclePhysicsState = {
    speed: 0,
    heading: 0,
    lateralSpeed: 0,
    traction: 1,
    impact: 0,
  };
  private readonly tuning?: VehicleTuning;

  constructor(options: VehicleControllerOptions = {}) {
    this.collisionPadding = options.collisionPadding ?? 0.15;
    this.tuning = options.tuning;
  }

  update(
    deltaSeconds: number,
    vehicle: { position: Vector3; rotation: { y: number } },
    input: VehicleInputState,
    obstacles: ObstacleBody[],
    modifiers: VehicleControllerModifiers,
  ): { collided: boolean; blockedBy: string | null } {
    this.lastSafePosition.copy(vehicle.position);
    this.safeVelocity.copy(this.velocity);
    const driveInput = input.throttle - input.brake;
    const frontPileLoad = Math.max(0, modifiers.frontPileLoad);
    const frontLoadDivisor = this.tuning?.frontLoadDivisor ?? 0.92;
    const frontLoadFactor = Math.min(frontPileLoad / frontLoadDivisor, 2.2);
    const offPlayableAreaFactor = modifiers.offPlayableArea ? 1 : 0;
    const snowGrip = modifiers.offPlayableArea ? 0.34 : modifiers.onSnow ? 0.72 : 0.96;
    const dragStrength = this.tuning?.frontLoadDragStrength ?? 0.62;
    const plowDrag = modifiers.plowEngaged ? 1.72 * Math.max(0.08, 1 - frontLoadFactor * dragStrength) : 1;
    const traction = snowGrip * (input.handbrake ? 0.68 : 1) * plowDrag;
    const engineStrength = this.tuning?.frontLoadEngineStrength ?? 0.1;
    const reverseEngineForce = this.tuning?.reverseEngineForce ?? 22.5;
    const forwardEngineForce = this.tuning?.forwardEngineForce ?? 25;
    const offPlayableEnginePenalty = modifiers.offPlayableArea ? 0.18 : 1;
    const engineForce =
      driveInput >= 0
        ? forwardEngineForce * Math.max(0.04, 1 - frontLoadFactor * engineStrength) * offPlayableEnginePenalty
        : reverseEngineForce * (modifiers.offPlayableArea ? 0.24 : 1);
    const rollingResistance =
      (modifiers.offPlayableArea ? 5.8 : modifiers.onSnow ? 1.25 : 0.85) +
      frontLoadFactor * (this.tuning?.frontLoadResistanceStrength ?? 1.0) +
      offPlayableAreaFactor * 1.8;
    const aerodynamicDrag = 0.032;
    const snowBrakeForce = modifiers.offPlayableArea ? 10.8 : modifiers.onSnow ? 7.2 : 9.5;
    const gripBlend = 1 - Math.exp(-deltaSeconds * (modifiers.offPlayableArea ? 2.2 : modifiers.onSnow ? 3.4 : 6.8));
    const maxForwardSpeedBase = modifiers.plowEngaged ? (this.tuning?.maxForwardSpeed ?? 11) : 14.5;
    const maxForwardSpeed =
      maxForwardSpeedBase *
      Math.max(0.02, 1 - frontLoadFactor * (this.tuning?.frontLoadMaxSpeedStrength ?? 0.28)) *
      (modifiers.offPlayableArea ? 0.24 : 1);
    const maxReverseSpeed = -(this.tuning?.maxReverseSpeed ?? 22.4) * (modifiers.offPlayableArea ? 0.28 : 1);

    this.forwardDirection.copy(FORWARD).applyAxisAngle(UP_AXIS, this.physicsState.heading);
    let forwardSpeed = this.velocity.dot(this.forwardDirection);

    const speedRatio = Math.min(Math.abs(forwardSpeed) / Math.max(maxForwardSpeed, 0.001), 1);
    const steerGrip = Math.max(0.22, traction);
    const frontSteerAngle = input.steer * MAX_FRONT_STEER_ANGLE * (0.42 + (1 - speedRatio) * 0.58) * steerGrip;
    const rearSteerAngle = -input.steer * MAX_REAR_STEER_ANGLE * Math.max(0.18, 1 - speedRatio * 0.9) * steerGrip;
    const curvature = (Math.tan(frontSteerAngle) - Math.tan(rearSteerAngle)) / STEERING_WHEELBASE;
    this.physicsState.heading -= curvature * forwardSpeed * deltaSeconds;

    vehicle.rotation.y = this.physicsState.heading;
    this.forwardDirection.copy(FORWARD).applyAxisAngle(UP_AXIS, this.physicsState.heading);
    this.velocity.addScaledVector(this.forwardDirection, driveInput * engineForce * deltaSeconds);

    forwardSpeed = this.velocity.dot(this.forwardDirection);
    this.lateralVelocity.copy(this.velocity).addScaledVector(this.forwardDirection, -forwardSpeed);
    let nextForwardSpeed = forwardSpeed;
    nextForwardSpeed -= forwardSpeed * rollingResistance * deltaSeconds;
    nextForwardSpeed -= forwardSpeed * Math.abs(forwardSpeed) * aerodynamicDrag * deltaSeconds;

    if (Math.abs(driveInput) < 0.05) {
      nextForwardSpeed = this.moveTowardZero(
        nextForwardSpeed,
        (modifiers.offPlayableArea ? 2.8 : modifiers.onSnow ? 1.1 : 1.6) * deltaSeconds,
      );
    }

    if (input.handbrake || input.brake > 0.05) {
      nextForwardSpeed = this.moveTowardZero(
        nextForwardSpeed,
        (snowBrakeForce * Math.max(input.brake, input.handbrake ? 1 : 0.35)) * deltaSeconds,
      );
    }

    const stopThreshold = this.tuning?.frontLoadStopThreshold ?? 0.46;
    const stopStrength = this.tuning?.frontLoadStopStrength ?? 10.5;
    if (driveInput > 0 && frontPileLoad > stopThreshold) {
      nextForwardSpeed = this.moveTowardZero(nextForwardSpeed, (frontPileLoad - stopThreshold) * stopStrength * deltaSeconds);
    }

    nextForwardSpeed = Math.min(Math.max(nextForwardSpeed, maxReverseSpeed), maxForwardSpeed);
    this.forwardVelocity.copy(this.forwardDirection).multiplyScalar(nextForwardSpeed);
    this.lateralVelocity.multiplyScalar(Math.max(0, 1 - gripBlend));
    this.velocity.copy(this.forwardVelocity).add(this.lateralVelocity);
    this.nextPosition.copy(vehicle.position).addScaledVector(this.velocity, deltaSeconds);
    vehicle.position.copy(this.nextPosition);

    const collision = this.resolveCollision(vehicle, obstacles);

    const alignedForwardSpeed = this.velocity.dot(this.forwardDirection);
    const alignedLateral = this.velocity.clone().addScaledVector(this.forwardDirection, -alignedForwardSpeed);
    this.physicsState.speed = alignedForwardSpeed;
    this.physicsState.heading = vehicle.rotation.y;
    this.physicsState.lateralSpeed = alignedLateral.length() * Math.sign(alignedLateral.dot(new Vector3(-this.forwardDirection.z, 0, this.forwardDirection.x)) || 1);
    this.physicsState.traction = traction;
    this.physicsState.impact = Math.max(0, this.physicsState.impact - deltaSeconds * 2.5);

    return collision;
  }

  getPhysicsState(): VehiclePhysicsState {
    return {
      speed: this.physicsState.speed,
      heading: this.physicsState.heading,
      lateralSpeed: this.physicsState.lateralSpeed,
      traction: this.physicsState.traction,
      impact: this.physicsState.impact,
    };
  }

  reset(): void {
    this.physicsState.speed = 0;
    this.physicsState.heading = 0;
    this.physicsState.lateralSpeed = 0;
    this.physicsState.traction = 1;
    this.physicsState.impact = 0;
    this.velocity.set(0, 0, 0);
  }

  private resolveCollision(
    vehicle: { position: Vector3 },
    obstacles: ObstacleBody[],
  ): { collided: boolean; blockedBy: string | null } {
    this.updateBounds(vehicle.position);

    for (const obstacle of obstacles) {
      this.paddedBounds.copy(obstacle.bounds).expandByScalar(this.collisionPadding);

      if (this.vehicleBounds.intersectsBox(this.paddedBounds)) {
        vehicle.position.copy(this.lastSafePosition);
        this.updateBounds(vehicle.position);
        const impactStrength = Math.min(this.velocity.length() / 12, 1);
        this.velocity.copy(this.safeVelocity).multiplyScalar(-0.28 - impactStrength * 0.22);
        this.physicsState.impact = impactStrength;
        return { collided: true, blockedBy: obstacle.label };
      }
    }

    return { collided: false, blockedBy: null };
  }

  private updateBounds(position: Vector3): void {
    this.vehicleBounds.setFromCenterAndSize(
      position.clone().setY(HALF_EXTENTS.y),
      HALF_EXTENTS.clone().multiplyScalar(2),
    );
  }

  private moveTowardZero(value: number, delta: number): number {
    if (value > 0) {
      return Math.max(0, value - delta);
    }

    if (value < 0) {
      return Math.min(0, value + delta);
    }

    return 0;
  }
}
