interface VehicleAudioUpdate {
  speed: number;
  throttle: number;
  frontPileLoad: number;
  plowEngaged: boolean;
  onSnow: boolean;
  offPlayableArea: boolean;
}

export class VehicleAudioSystem {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private enginePulseGain: GainNode | null = null;
  private enginePulseDepthGain: GainNode | null = null;
  private enginePulseOscillator: OscillatorNode | null = null;
  private engineLowOscillator: OscillatorNode | null = null;
  private engineMidOscillator: OscillatorNode | null = null;
  private engineHighOscillator: OscillatorNode | null = null;
  private dieselNoiseGain: GainNode | null = null;
  private turboGain: GainNode | null = null;
  private turboOscillator: OscillatorNode | null = null;
  private scrapeGain: GainNode | null = null;
  private turboLag = 0;
  private resumeTarget: EventTarget | null = null;
  private readonly handleResume = () => {
    void this.audioContext?.resume();
  };

  mount(target: EventTarget): void {
    this.resumeTarget = target;
    target.addEventListener('pointerdown', this.handleResume);
    target.addEventListener('keydown', this.handleResume);
    this.ensureAudioGraph();
  }

  update(state: VehicleAudioUpdate): void {
    this.ensureAudioGraph();
    if (
      !this.audioContext ||
      !this.masterGain ||
      !this.engineGain ||
      !this.enginePulseGain ||
      !this.enginePulseDepthGain ||
      !this.enginePulseOscillator ||
      !this.engineLowOscillator ||
      !this.engineMidOscillator ||
      !this.engineHighOscillator ||
      !this.dieselNoiseGain ||
      !this.turboGain ||
      !this.turboOscillator ||
      !this.scrapeGain
    ) {
      return;
    }

    const now = this.audioContext.currentTime;
    const speed = Math.abs(state.speed);
    const load = Math.min(1.6, state.frontPileLoad * 0.8 + state.throttle * 0.75 + (state.offPlayableArea ? 0.35 : 0));
    const rpm = 12 + speed * 1.3 + state.throttle * 2.8 + load * 2.2;
    const engineVolume = 0.03 + speed * 0.006 + state.throttle * 0.022 + load * 0.024;
    const dieselNoise = 0.008 + state.throttle * 0.008 + load * 0.014;
    const scrapeVolume = state.plowEngaged && state.onSnow ? 0.02 + speed * 0.015 + load * 0.028 : 0;
    const turboTarget = Math.min(1, load * 0.62 + state.throttle * 0.22 + speed * 0.015);
    const turboResponse = turboTarget > this.turboLag ? 1.9 : 0.85;
    const turboBlend = 1 - Math.exp(-turboResponse / 60);
    this.turboLag += (turboTarget - this.turboLag) * turboBlend;

    this.enginePulseOscillator.frequency.setTargetAtTime(Math.max(5.5, rpm * 0.68), now, 0.12);
    this.engineLowOscillator.frequency.setTargetAtTime(28 + rpm * 0.8, now, 0.1);
    this.engineMidOscillator.frequency.setTargetAtTime(46 + rpm * 1.25, now, 0.08);
    this.engineHighOscillator.frequency.setTargetAtTime(74 + rpm * 1.75, now, 0.07);
    this.enginePulseGain.gain.setTargetAtTime(0.5 + load * 0.12 + state.throttle * 0.06, now, 0.09);
    this.enginePulseDepthGain.gain.setTargetAtTime(0.16 + load * 0.16, now, 0.1);
    this.engineGain.gain.setTargetAtTime(Math.min(engineVolume, 0.16), now, 0.08);
    this.dieselNoiseGain.gain.setTargetAtTime(Math.min(dieselNoise, 0.055), now, 0.08);
    this.turboOscillator.frequency.setTargetAtTime(120 + this.turboLag * 260 + speed * 8, now, 0.16);
    this.turboGain.gain.setTargetAtTime(Math.min(0.003 + this.turboLag * 0.028, 0.04), now, 0.18);
    this.scrapeGain.gain.setTargetAtTime(Math.min(scrapeVolume, 0.12), now, 0.05);
  }

  playPenaltyTone(): void {
    this.ensureAudioGraph();
    if (!this.audioContext || this.audioContext.state !== 'running' || !this.masterGain) {
      return;
    }

    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(220, now);
    oscillator.frequency.exponentialRampToValueAtTime(95, now + 0.22);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.3);
  }

  dispose(): void {
    if (this.resumeTarget) {
      this.resumeTarget.removeEventListener('pointerdown', this.handleResume);
      this.resumeTarget.removeEventListener('keydown', this.handleResume);
    }
    this.resumeTarget = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.masterGain = null;
    this.engineGain = null;
    this.enginePulseGain = null;
    this.enginePulseDepthGain = null;
    this.enginePulseOscillator = null;
    this.engineLowOscillator = null;
    this.engineMidOscillator = null;
    this.engineHighOscillator = null;
    this.dieselNoiseGain = null;
    this.turboGain = null;
    this.turboOscillator = null;
    this.scrapeGain = null;
    this.turboLag = 0;
  }

  private ensureAudioGraph(): void {
    if (this.audioContext) {
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);

    const engineGain = context.createGain();
    engineGain.gain.value = 0.038;
    engineGain.connect(master);

    const enginePulseGain = context.createGain();
    enginePulseGain.gain.value = 0.54;
    enginePulseGain.connect(engineGain);

    const pulseBase = context.createConstantSource();
    pulseBase.offset.value = 0.54;
    pulseBase.connect(enginePulseGain.gain);
    pulseBase.start();

    const pulseDepthGain = context.createGain();
    pulseDepthGain.gain.value = 0.2;
    pulseDepthGain.connect(enginePulseGain.gain);

    const pulseOsc = context.createOscillator();
    pulseOsc.type = 'square';
    pulseOsc.frequency.value = 7.5;
    pulseOsc.connect(pulseDepthGain);
    pulseOsc.start();

    const lowOsc = context.createOscillator();
    lowOsc.type = 'triangle';
    lowOsc.frequency.value = 28;
    lowOsc.detune.value = -6;
    lowOsc.connect(enginePulseGain);
    lowOsc.start();

    const midOsc = context.createOscillator();
    midOsc.type = 'sawtooth';
    midOsc.frequency.value = 46;
    midOsc.detune.value = 3;
    midOsc.connect(enginePulseGain);
    midOsc.start();

    const highOsc = context.createOscillator();
    highOsc.type = 'triangle';
    highOsc.frequency.value = 74;
    highOsc.detune.value = 7;
    highOsc.connect(enginePulseGain);
    highOsc.start();

    const dieselNoiseGain = context.createGain();
    dieselNoiseGain.gain.value = 0.008;
    dieselNoiseGain.connect(master);
    this.createNoiseSource(context, 18, 72, 240).connect(dieselNoiseGain);

    const turboGain = context.createGain();
    turboGain.gain.value = 0;
    turboGain.connect(master);

    const turboOsc = context.createOscillator();
    turboOsc.type = 'triangle';
    turboOsc.frequency.value = 120;
    turboOsc.connect(turboGain);
    turboOsc.start();

    const scrapeGain = context.createGain();
    scrapeGain.gain.value = 0;
    scrapeGain.connect(master);
    this.createNoiseSource(context, 0.65, 400, 2200).connect(scrapeGain);

    this.audioContext = context;
    this.masterGain = master;
    this.engineGain = engineGain;
    this.enginePulseGain = enginePulseGain;
    this.enginePulseDepthGain = pulseDepthGain;
    this.enginePulseOscillator = pulseOsc;
    this.engineLowOscillator = lowOsc;
    this.engineMidOscillator = midOsc;
    this.engineHighOscillator = highOsc;
    this.dieselNoiseGain = dieselNoiseGain;
    this.turboGain = turboGain;
    this.turboOscillator = turboOsc;
    this.scrapeGain = scrapeGain;
  }

  private createNoiseSource(
    context: AudioContext,
    lowpassFrequency: number,
    bandpassFrequency: number,
    highCutFrequency: number,
  ): AudioNode {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = bandpassFrequency;
    bandpass.Q.value = 0.7;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = highCutFrequency;

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = lowpassFrequency;

    source.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(highpass);
    source.start();
    return highpass;
  }
}
