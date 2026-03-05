export type PitchResult = {
  hz: number;
  probability: number; // 0..1 (higher = more confident)
  rms: number; // signal energy
} | null;

export type PitchEngineOptions = {
  sampleRate: number;
  bufferSize: number;
  minHz?: number;
  maxHz?: number;
  threshold?: number; // YIN threshold (typically 0.1..0.2)
  minProbability?: number; // discard below this
  emaAlpha?: number; // smoothing alpha for hz (0..1), higher = snappier
};

function rmsFromBuffer(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const v = buffer[i];
    sum += v * v;
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Allocation-free YIN pitch engine.
 * Reuses internal buffers across frames for low-latency real-time processing.
 */
export class PitchEngine {
  private readonly sampleRate: number;
  public readonly bufferSize: number;

  private minHz: number;
  private maxHz: number;
  private threshold: number;
  private minProbability: number;
  private emaAlpha: number;

  private minTau: number;
  private maxTau: number;

  private diff: Float32Array;
  private cmndf: Float32Array;

  private smoothedHz: number | null = null;

  constructor(opts: PitchEngineOptions) {
    this.sampleRate = opts.sampleRate;
    this.bufferSize = opts.bufferSize;

    this.minHz = opts.minHz ?? 80;
    this.maxHz = opts.maxHz ?? 1000;
    this.threshold = opts.threshold ?? 0.15;
    this.minProbability = opts.minProbability ?? 0.7;
    this.emaAlpha = opts.emaAlpha ?? 0.2;

    this.minTau = 0;
    this.maxTau = 0;
    this.diff = new Float32Array(0);
    this.cmndf = new Float32Array(0);

    this.reconfigure(this.minHz, this.maxHz);
  }

  /** Recompute tau range and (re)allocate internal arrays only when necessary. */
  reconfigure(minHz: number, maxHz: number): void {
    this.minHz = Math.max(1, minHz);
    this.maxHz = Math.max(this.minHz + 1, maxHz);

    this.minTau = Math.max(2, Math.floor(this.sampleRate / this.maxHz));
    this.maxTau = Math.floor(this.sampleRate / this.minHz);

    const needed = this.maxTau + 1;
    if (this.diff.length !== needed) {
      this.diff = new Float32Array(needed);
      this.cmndf = new Float32Array(needed);
    }
  }

  resetSmoothing(): void {
    this.smoothedHz = null;
  }

  /**
   * Process one audio frame (time-domain samples) and return pitch if confident.
   * NOTE: `buffer` must be a stable, reused Float32Array for best performance.
   */
  process(buffer: Float32Array): PitchResult {
    if (buffer.length !== this.bufferSize) {
      // Safety: allow processing even if analyser size changes.
      // Reconfigure bufferSize is not supported; caller should recreate engine.
    }

    const rms = rmsFromBuffer(buffer);

    // Quick reject on near-silence (caller may also gate by rms)
    if (rms < 0.005) return null;

    // YIN difference function
    const SIZE = buffer.length;
    const minTau = this.minTau;
    const maxTau = this.maxTau;

    if (minTau < 2 || maxTau <= minTau + 2 || maxTau >= SIZE) return null;

    // diff[0] unused; set first values
    this.diff[0] = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
      let sum = 0;
      // unrolled-ish loop for speed
      for (let i = 0; i < SIZE - tau; i += 1) {
        const d = buffer[i] - buffer[i + tau];
        sum += d * d;
      }
      this.diff[tau] = sum;
    }

    // Cumulative mean normalized difference function (CMNDF)
    this.cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
      runningSum += this.diff[tau];
      this.cmndf[tau] = runningSum > 0 ? (this.diff[tau] * tau) / runningSum : 1;
    }

    // Absolute threshold
    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (this.cmndf[tau] < this.threshold) {
        // Local minimum search
        while (tau + 1 <= maxTau && this.cmndf[tau + 1] < this.cmndf[tau]) tau += 1;
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate < 0) return null;

    // Parabolic interpolation for better precision
    const betterTau = this.parabolicInterpolation(tauEstimate);

    const hz = this.sampleRate / betterTau;
    if (!Number.isFinite(hz) || hz <= 0) return null;

    const probability = Math.max(0, Math.min(1, 1 - this.cmndf[Math.round(tauEstimate)]));

    if (probability < this.minProbability) return null;

    const smoothedHz = this.applySmoothing(hz);

    return { hz: smoothedHz, probability, rms };
  }

  private applySmoothing(hz: number): number {
    if (this.emaAlpha <= 0) return hz;
    if (this.smoothedHz == null) {
      this.smoothedHz = hz;
      return hz;
    }
    // If pitch jumps a lot (octave errors), allow faster correction
    const prev = this.smoothedHz;
    const ratio = hz > prev ? hz / prev : prev / hz;
    const alpha = ratio > 1.25 ? Math.min(0.6, this.emaAlpha * 3) : this.emaAlpha;

    const next = prev + (hz - prev) * alpha;
    this.smoothedHz = next;
    return next;
  }

  private parabolicInterpolation(tau: number): number {
    const x0 = tau - 1 >= 0 ? tau - 1 : tau;
    const x2 = tau + 1 < this.cmndf.length ? tau + 1 : tau;

    if (x0 === tau || x2 === tau) return tau;

    const s0 = this.cmndf[x0];
    const s1 = this.cmndf[tau];
    const s2 = this.cmndf[x2];

    // vertex of parabola through (x0,s0), (tau,s1), (x2,s2)
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom === 0) return tau;

    const delta = (s2 - s0) / denom;
    return tau + delta;
  }
}
