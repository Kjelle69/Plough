import type { VehicleInputState } from '../core/types';

type InputSource = 'keyboard' | 'gamepad' | 'none';

declare global {
  interface Window {
    __ploughTestGamepads?: Gamepad[];
  }
}

export class GameInput {
  private readonly pressedKeys = new Set<string>();

  private activeSource: InputSource = 'none';

  private readonly handleKeydown = (event: KeyboardEvent) => {
    this.pressedKeys.add(event.code);
  };

  private readonly handleKeyup = (event: KeyboardEvent) => {
    this.pressedKeys.delete(event.code);
  };

  mount(): void {
    window.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('keyup', this.handleKeyup);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('keyup', this.handleKeyup);
    this.pressedKeys.clear();
  }

  readVehicleInput(): VehicleInputState {
    const gamepadInput = this.readGamepadInput();

    if (gamepadInput) {
      this.activeSource = 'gamepad';
      return gamepadInput;
    }

    const keyboardInput = this.readKeyboardInput();
    const hasKeyboardIntent =
      keyboardInput.throttle > 0 ||
      keyboardInput.brake > 0 ||
      keyboardInput.handbrake ||
      Math.abs(keyboardInput.steer) > 0;

    this.activeSource = hasKeyboardIntent ? 'keyboard' : 'none';
    return keyboardInput;
  }

  getActiveSource(): InputSource {
    return this.activeSource;
  }

  private readKeyboardInput(): VehicleInputState {
    const steerLeft = this.isPressed('ArrowLeft') || this.isPressed('KeyA');
    const steerRight = this.isPressed('ArrowRight') || this.isPressed('KeyD');
    const throttle = this.isPressed('ArrowUp') || this.isPressed('KeyW') ? 1 : 0;
    const brake = this.isPressed('ArrowDown') || this.isPressed('KeyS') ? 1 : 0;

    return {
      steer: (steerRight ? 1 : 0) - (steerLeft ? 1 : 0),
      throttle,
      brake,
      handbrake: this.isPressed('Space'),
      plowAngleDelta: (this.isPressed('KeyE') ? 1 : 0) - (this.isPressed('KeyQ') ? 1 : 0),
      plowLiftDelta: (this.isPressed('KeyX') ? 1 : 0) - (this.isPressed('KeyZ') ? 1 : 0),
    };
  }

  private readGamepadInput(): VehicleInputState | null {
    const gamepads = this.getGamepads();
    const gamepad = gamepads.find((candidate) => candidate?.connected);

    if (!gamepad) {
      return null;
    }

    const leftStickX = this.applyDeadzone(gamepad.axes[0] ?? 0);
    const leftStickY = this.applyDeadzone(gamepad.axes[1] ?? 0);
    const accelerateTrigger = gamepad.buttons[7]?.value ?? 0;
    const brakeTrigger = gamepad.buttons[6]?.value ?? 0;
    const plowAngleDelta = (gamepad.buttons[5]?.value ?? 0) - (gamepad.buttons[4]?.value ?? 0);
    const plowLiftDelta = (gamepad.buttons[12]?.value ?? 0) - (gamepad.buttons[13]?.value ?? 0);
    const throttle = Math.max(accelerateTrigger, -leftStickY);
    const brake = Math.max(brakeTrigger, leftStickY);
    const handbrake = Boolean(gamepad.buttons[0]?.pressed);

    const hasIntent =
      Math.abs(leftStickX) > 0 ||
      throttle > 0.05 ||
      brake > 0.05 ||
      handbrake ||
      Math.abs(plowAngleDelta) > 0.05 ||
      Math.abs(plowLiftDelta) > 0.05;

    if (!hasIntent) {
      return null;
    }

    return {
      steer: leftStickX,
      throttle: this.clamp01(throttle),
      brake: this.clamp01(brake),
      handbrake,
      plowAngleDelta,
      plowLiftDelta,
    };
  }

  private getGamepads(): Gamepad[] {
    if (Array.isArray(window.__ploughTestGamepads)) {
      return window.__ploughTestGamepads;
    }

    const provider = navigator.getGamepads?.bind(navigator);
    if (!provider) {
      return [];
    }

    return Array.from(provider()).filter((gamepad): gamepad is Gamepad => gamepad !== null);
  }

  private applyDeadzone(value: number): number {
    const deadzone = 0.16;
    if (Math.abs(value) <= deadzone) {
      return 0;
    }

    const normalizedMagnitude = (Math.abs(value) - deadzone) / (1 - deadzone);
    return Math.sign(value) * normalizedMagnitude;
  }

  private clamp01(value: number): number {
    return Math.min(Math.max(value, 0), 1);
  }

  private isPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }
}
