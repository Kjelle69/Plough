import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

interface ExhaustSmokeUpdate {
  center: Vector3;
  forward: Vector3;
  intensity: number;
  deltaSeconds: number;
}

const DEFAULT_PARTICLE_COUNT = 400;
const DRAG = 0.62;
const GRAVITY = 0.3;

export class ExhaustSmokeSystem {
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
  private readonly emissionOrigin = new Vector3();
  private readonly tint = new Color();
  private emissionCarry = 0;

  constructor(maxParticles = DEFAULT_PARTICLE_COUNT) {
    this.maxParticles = maxParticles;
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
          gl_PointSize = size * (280.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float dist = length(centered);
          float core = smoothstep(0.52, 0.02, dist);
          float haze = smoothstep(0.84, 0.12, dist) * 0.55;
          float alpha = (core * 0.38 + haze) * vAlpha;
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

  update(state: ExhaustSmokeUpdate): void {
    let needsUpload = false;

    for (let index = 0; index < this.maxParticles; index += 1) {
      const life = this.lifetimes[index];
      if (life <= 0) {
        continue;
      }

      const nextLife = Math.max(0, life - state.deltaSeconds);
      this.lifetimes[index] = nextLife;
      const baseIndex = index * 3;
      const drag = Math.exp(-DRAG * state.deltaSeconds);
      this.velocities[baseIndex] *= drag;
      this.velocities[baseIndex + 1] = this.velocities[baseIndex + 1] * drag - GRAVITY * state.deltaSeconds;
      this.velocities[baseIndex + 2] *= drag;

      this.positions[baseIndex] += this.velocities[baseIndex] * state.deltaSeconds;
      this.positions[baseIndex + 1] += this.velocities[baseIndex + 1] * state.deltaSeconds;
      this.positions[baseIndex + 2] += this.velocities[baseIndex + 2] * state.deltaSeconds;

      if (nextLife <= 0) {
        this.positions[baseIndex + 1] = -999;
        this.alphas[index] = 0;
        this.sizes[index] = 0;
      } else {
        const age = 1 - nextLife / Math.max(this.lifetimesMax[index], 0.0001);
        const fade = Math.max(0, 1 - age * 0.92);
        this.tint.setRGB(0.08 + age * 0.12, 0.08 + age * 0.12, 0.08 + age * 0.12);
        this.colors[baseIndex] = this.tint.r;
        this.colors[baseIndex + 1] = this.tint.g;
        this.colors[baseIndex + 2] = this.tint.b;
        this.alphas[index] = fade * 0.42;
        this.sizes[index] = 3 + age * 2.8;
      }

      needsUpload = true;
    }

    if (state.intensity > 0.02) {
      this.emissionCarry += state.intensity * state.deltaSeconds * 8;
      const emissionCount = Math.floor(this.emissionCarry);
      this.emissionCarry -= emissionCount;
      for (let index = 0; index < emissionCount; index += 1) {
        this.emitParticle(state.center, state.forward, state.intensity);
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
    this.emissionCarry = 0;
    for (let index = 0; index < this.maxParticles; index += 1) {
      this.positions[index * 3 + 1] = -999;
    }
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  private emitParticle(center: Vector3, forward: Vector3, intensity: number): void {
    const particleIndex = this.findFreeParticle();
    const baseIndex = particleIndex * 3;
    const spreadX = (Math.random() - 0.5) * 0.025;
    const spreadZ = (Math.random() - 0.5) * 0.025;
    this.emissionOrigin.copy(center);
    this.emissionOrigin.x += spreadX;
    this.emissionOrigin.y += Math.random() * 0.02;
    this.emissionOrigin.z += spreadZ;

    this.positions[baseIndex] = this.emissionOrigin.x;
    this.positions[baseIndex + 1] = this.emissionOrigin.y;
    this.positions[baseIndex + 2] = this.emissionOrigin.z;
    this.velocities[baseIndex] = -forward.x * (0.04 + intensity * 0.08) + spreadX * 0.12;
    this.velocities[baseIndex + 1] = 0.46 + intensity * 0.85 + Math.random() * 0.12;
    this.velocities[baseIndex + 2] = -forward.z * (0.04 + intensity * 0.08) + spreadZ * 0.12;
    const lifetime = 0.85 + intensity * 0.35 + Math.random() * 0.14;
    this.lifetimes[particleIndex] = lifetime;
    this.lifetimesMax[particleIndex] = lifetime;
    this.sizes[particleIndex] = 2.2 + Math.random() * 0.55;
    this.alphas[particleIndex] = 0.28 + intensity * 0.18;
    this.colors[baseIndex] = 0.03;
    this.colors[baseIndex + 1] = 0.03;
    this.colors[baseIndex + 2] = 0.03;
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
