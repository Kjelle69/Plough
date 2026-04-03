import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';

interface SnowSpraySystemOptions {
  maxParticles?: number;
}

interface SnowSprayUpdate {
  center: Vector3;
  forward: Vector2;
  right: Vector2;
  speed: number;
  plowEngaged: boolean;
  onSnow: boolean;
  deltaSeconds: number;
}

const DEFAULT_PARTICLE_COUNT = 180;
const GRAVITY = 1.35;
const DRAG = 0.72;

export class SnowSpraySystem {
  readonly points: Points;

  private readonly maxParticles: number;
  private readonly geometry: BufferGeometry;
  private readonly positionAttribute: BufferAttribute;
  private readonly colorAttribute: BufferAttribute;
  private readonly sizeAttribute: BufferAttribute;
  private readonly alphaAttribute: BufferAttribute;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly lifetimesMax: Float32Array;
  private readonly center = new Vector3();
  private readonly emitterOrigin = new Vector3();
  private readonly tint = new Color();
  private readonly leftOrigin = new Vector3();
  private readonly rightOrigin = new Vector3();

  constructor(options: SnowSpraySystemOptions = {}) {
    this.maxParticles = options.maxParticles ?? DEFAULT_PARTICLE_COUNT;
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);
    this.velocities = new Float32Array(this.maxParticles * 3);
    this.lifetimes = new Float32Array(this.maxParticles);
    this.lifetimesMax = new Float32Array(this.maxParticles);

    this.geometry = new BufferGeometry();
    this.positionAttribute = new BufferAttribute(this.positions, 3);
    this.positionAttribute.setUsage(DynamicDrawUsage);
    this.colorAttribute = new BufferAttribute(this.colors, 3);
    this.colorAttribute.setUsage(DynamicDrawUsage);
    this.sizeAttribute = new BufferAttribute(this.sizes, 1);
    this.sizeAttribute.setUsage(DynamicDrawUsage);
    this.alphaAttribute = new BufferAttribute(this.alphas, 1);
    this.alphaAttribute.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('color', this.colorAttribute);
    this.geometry.setAttribute('size', this.sizeAttribute);
    this.geometry.setAttribute('alpha', this.alphaAttribute);

    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: false,
      uniforms: {},
      vertexShader: `
        attribute vec3 color;
        attribute float size;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float dist = length(centered);
          float softness = smoothstep(0.54, 0.02, dist);
          float haze = smoothstep(0.78, 0.12, dist) * 0.45;
          float alpha = (softness * 0.42 + haze) * vAlpha;
          if (alpha <= 0.01) {
            discard;
          }
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });

    this.points = new Points(this.geometry, material);
    this.points.frustumCulled = false;

    this.reset();
  }

  update(state: SnowSprayUpdate): void {
    let needsUpload = false;

    for (let index = 0; index < this.maxParticles; index += 1) {
      const life = this.lifetimes[index];
      if (life <= 0) {
        continue;
      }

      const nextLife = Math.max(0, life - state.deltaSeconds);
      this.lifetimes[index] = nextLife;
      const velocityIndex = index * 3;
      const drag = Math.exp(-DRAG * state.deltaSeconds);
      this.velocities[velocityIndex] *= drag;
      this.velocities[velocityIndex + 1] = this.velocities[velocityIndex + 1] * drag - GRAVITY * state.deltaSeconds;
      this.velocities[velocityIndex + 2] *= drag;

      this.positions[velocityIndex] += this.velocities[velocityIndex] * state.deltaSeconds;
      this.positions[velocityIndex + 1] += this.velocities[velocityIndex + 1] * state.deltaSeconds;
      this.positions[velocityIndex + 2] += this.velocities[velocityIndex + 2] * state.deltaSeconds;

      if (nextLife <= 0) {
        this.positions[velocityIndex + 1] = -999;
        this.colors[velocityIndex] = 0;
        this.colors[velocityIndex + 1] = 0;
        this.colors[velocityIndex + 2] = 0;
        this.alphas[index] = 0;
        this.sizes[index] = 0;
      } else {
        const lifeRatio = nextLife / Math.max(this.lifetimesMax[index], 0.0001);
        const age = 1 - lifeRatio;
        const fade = Math.max(0, 1 - age * 1.05);
        this.tint.setRGB(0.74 + fade * 0.14, 0.8 + fade * 0.12, 0.86 + fade * 0.1);
        this.colors[velocityIndex] = this.tint.r;
        this.colors[velocityIndex + 1] = this.tint.g;
        this.colors[velocityIndex + 2] = this.tint.b;
        this.alphas[index] = fade * 0.14;
        this.sizes[index] = 7 + age * 18;
      }

      needsUpload = true;
    }

    if (state.onSnow && state.plowEngaged && state.speed > 0.8) {
      const emissionCount = Math.min(
        12,
        Math.max(2, Math.round(state.speed * state.deltaSeconds * 18)),
      );
      this.center.copy(state.center);
      this.leftOrigin.copy(this.center).add(new Vector3(state.right.x * 1.05, 0, state.right.y * 1.05));
      this.rightOrigin.copy(this.center).add(new Vector3(-state.right.x * 1.05, 0, -state.right.y * 1.05));

      for (let index = 0; index < emissionCount; index += 1) {
        const origin = index % 2 === 0 ? this.leftOrigin : this.rightOrigin;
        this.emitParticle(origin, state.forward, state.right, state.speed);
      }
      needsUpload = true;
    }

    if (needsUpload) {
      this.positionAttribute.needsUpdate = true;
      this.colorAttribute.needsUpdate = true;
      this.sizeAttribute.needsUpdate = true;
      this.alphaAttribute.needsUpdate = true;
    }
  }

  reset(): void {
    this.positions.fill(0);
    this.colors.fill(0);
    this.sizes.fill(0);
    this.alphas.fill(0);
    this.velocities.fill(0);
    this.lifetimes.fill(0);
    this.lifetimesMax.fill(0);

    for (let index = 0; index < this.maxParticles; index += 1) {
      this.positions[index * 3 + 1] = -999;
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  private emitParticle(origin: Vector3, forward: Vector2, right: Vector2, speed: number): void {
    const particleIndex = this.findFreeParticle();
    const index = particleIndex * 3;
    const spread = (Math.random() - 0.5) * 1.45;
    const forwardJitter = Math.random() * 0.55;
    const drift = -0.16 - Math.random() * 0.18;

    this.emitterOrigin.copy(origin);
    this.emitterOrigin.x += right.x * spread;
    this.emitterOrigin.z += right.y * spread;
    this.emitterOrigin.y += 0.12 + Math.random() * 0.12;

    this.positions[index] = this.emitterOrigin.x;
    this.positions[index + 1] = this.emitterOrigin.y;
    this.positions[index + 2] = this.emitterOrigin.z;

    this.velocities[index] =
      forward.x * (speed * 0.08 + drift + forwardJitter * 0.2) + right.x * spread * 0.72;
    this.velocities[index + 1] = 0.02 + Math.random() * 0.08;
    this.velocities[index + 2] =
      forward.y * (speed * 0.08 + drift + forwardJitter * 0.2) + right.y * spread * 0.72;

    const lifetime = 0.9 + Math.random() * 0.45;
    this.lifetimes[particleIndex] = lifetime;
    this.lifetimesMax[particleIndex] = lifetime;
    this.colors[index] = 0.9;
    this.colors[index + 1] = 0.95;
    this.colors[index + 2] = 1;
    this.sizes[particleIndex] = 5 + Math.random() * 2.5;
    this.alphas[particleIndex] = 0.07 + Math.random() * 0.025;
  }

  private findFreeParticle(): number {
    for (let index = 0; index < this.maxParticles; index += 1) {
      if (this.lifetimes[index] <= 0) {
        return index;
      }
    }

    let lowestIndex = 0;
    let lowestLife = this.lifetimes[0];
    for (let index = 1; index < this.maxParticles; index += 1) {
      if (this.lifetimes[index] < lowestLife) {
        lowestLife = this.lifetimes[index];
        lowestIndex = index;
      }
    }
    return lowestIndex;
  }
}
