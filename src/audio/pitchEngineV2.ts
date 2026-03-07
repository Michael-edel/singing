export type PitchFrame = {
  hz: number | null;
  midi: number | null;
  cents: number | null;
  confidence: number;
  rms: number;
  voiced: boolean;
  stable: boolean;
  timestamp: number;
};

export type PitchEngineV2Options = {
  sampleRate: number;
  minHz?: number;
  maxHz?: number;
  minRms?: number;
  minConfidence?: number;
  smoothingAlpha?: number;
  jumpRejectCents?: number;
};

function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

function rmsFromBuffer(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function clampHz(hz: number, minHz: number, maxHz: number): number | null {
  if (!Number.isFinite(hz)) return null;
  if (hz < minHz || hz > maxHz) return null;
  return hz;
}

export class PitchEngineV2 {
  private prevHz: number | null = null;
  private history: number[] = [];
  private readonly opts: Required<PitchEngineV2Options>;

  constructor(opts: PitchEngineV2Options) {
    this.opts = {
      sampleRate: opts.sampleRate,
      minHz: opts.minHz ?? 80,
      maxHz: opts.maxHz ?? 1100,
      minRms: opts.minRms ?? 0.01,
      minConfidence: opts.minConfidence ?? 0.65,
      smoothingAlpha: opts.smoothingAlpha ?? 0.18,
      jumpRejectCents: opts.jumpRejectCents ?? 180,
    };
  }

  process(
    input: Float32Array,
    detector: (input: Float32Array, sampleRate: number) => { hz: number | null; confidence: number },
  ): PitchFrame {
    const rms = rmsFromBuffer(input);
    const timestamp = performance.now();

    if (rms < this.opts.minRms) {
      this.reset();
      return {
        hz: null,
        midi: null,
        cents: null,
        confidence: 0,
        rms,
        voiced: false,
        stable: false,
        timestamp,
      };
    }

    const detected = detector(input, this.opts.sampleRate);
    let rawHz = clampHz(detected.hz ?? NaN, this.opts.minHz, this.opts.maxHz);
    if (!rawHz || detected.confidence < this.opts.minConfidence) {
      return {
        hz: null,
        midi: null,
        cents: null,
        confidence: detected.confidence,
        rms,
        voiced: false,
        stable: false,
        timestamp,
      };
    }

    if (this.prevHz) {
      const jump = 1200 * Math.log2(rawHz / this.prevHz);
      if (Math.abs(jump) > this.opts.jumpRejectCents) rawHz = this.prevHz;
    }

    const hz = this.prevHz
      ? this.prevHz * (1 - this.opts.smoothingAlpha) + rawHz * this.opts.smoothingAlpha
      : rawHz;

    this.prevHz = hz;
    this.history.push(hz);
    if (this.history.length > 6) this.history.shift();

    const mean = this.history.reduce((acc, value) => acc + value, 0) / this.history.length;
    const variance = this.history.reduce((acc, value) => acc + (value - mean) ** 2, 0) / this.history.length;
    const stable = Math.sqrt(variance) < 8;

    return {
      hz,
      midi: hzToMidi(hz),
      cents: null,
      confidence: detected.confidence,
      rms,
      voiced: true,
      stable,
      timestamp,
    };
  }

  reset(): void {
    this.prevHz = null;
    this.history = [];
  }
}
