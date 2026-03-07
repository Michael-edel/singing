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

function centsDiff(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export class PitchEngineV2 {
  private prevHz: number | null = null;
  private history: number[] = [];
  private readonly opts: Required<PitchEngineV2Options>;

  constructor(options: PitchEngineV2Options) {
    this.opts = {
      sampleRate: options.sampleRate,
      minHz: options.minHz ?? 80,
      maxHz: options.maxHz ?? 1100,
      minRms: options.minRms ?? 0.01,
      minConfidence: options.minConfidence ?? 0.6,
      smoothingAlpha: options.smoothingAlpha ?? 0.18,
      jumpRejectCents: options.jumpRejectCents ?? 180,
    };
  }

  process(
    input: Float32Array,
    detector: (input: Float32Array, sampleRate: number) => { hz: number | null; confidence: number },
  ): PitchFrame {
    const signalRms = rmsFromBuffer(input);
    const timestamp = performance.now();

    if (signalRms < this.opts.minRms) {
      this.reset();
      return {
        hz: null, midi: null, cents: null, confidence: 0, rms: signalRms, voiced: false, stable: false, timestamp,
      };
    }

    const detected = detector(input, this.opts.sampleRate);
    let hz = detected.hz;
    if (!hz || !Number.isFinite(hz) || hz < this.opts.minHz || hz > this.opts.maxHz || detected.confidence < this.opts.minConfidence) {
      return {
        hz: null, midi: null, cents: null, confidence: detected.confidence, rms: signalRms, voiced: false, stable: false, timestamp,
      };
    }

    if (this.prevHz) {
      const jump = centsDiff(hz, this.prevHz);
      if (Math.abs(jump) > this.opts.jumpRejectCents) hz = this.prevHz;
    }

    const smoothedHz = this.prevHz
      ? this.prevHz * (1 - this.opts.smoothingAlpha) + hz * this.opts.smoothingAlpha
      : hz;

    this.prevHz = smoothedHz;
    this.history.push(smoothedHz);
    if (this.history.length > 6) this.history.shift();

    const mean = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    const variance = this.history.reduce((a, b) => a + (b - mean) ** 2, 0) / this.history.length;
    const stable = Math.sqrt(variance) < 8;

    return {
      hz: smoothedHz,
      midi: hzToMidi(smoothedHz),
      cents: null,
      confidence: detected.confidence,
      rms: signalRms,
      voiced: true,
      stable,
      timestamp,
    };
  }

  centsToTarget(hz: number | null, targetHz: number | null): number | null {
    if (!hz || !targetHz) return null;
    return centsDiff(hz, targetHz);
  }

  reset() {
    this.prevHz = null;
    this.history = [];
  }
}
