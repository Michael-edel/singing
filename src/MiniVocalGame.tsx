import { useEffect, useMemo, useRef, useState } from 'react';
import { PitchRingSmule } from './components/PitchRingSmule';
import { ScoreMeter } from './components/ScoreMeter';
import PitchRoad, { type PitchGrade, type PitchPoint } from './components/PitchRoad';
import HUDPanel from './components/HUDPanel';
import { PitchEngine } from './audio/PitchEngine';
import { PitchEngineV2 } from './audio/pitchEngineV2';
import { playReferenceTone as startReferenceTone, type ReferenceToneHandle } from './utils/referenceTone';
import { useI18n } from './i18n';

const TOTAL_ROUNDS = 5;
const CALIBRATION_MS = 4500;
const ROUND_MS = 2500;
const SILENCE_AUTOPAUSE_MS = 1000;
const UI_TICK_MS = 120;
const ROAD_TICK_MS = 140;
const ROAD_MAX_POINTS = 180;
const ROAD_CULL_MS = 4500;
const HISTORY_KEY = 'mini-vocal-history';
const STREAK_KEY = 'mini-vocal-streak';
const BOARD_KEY = 'mini-vocal-weekly-board';

type Stage = 'setup' | 'difficulty' | 'calibration' | 'game' | 'results';
type Difficulty = 'newbie' | 'pro';
type CalibStep = 'low' | 'high' | 'done';
type CalibrationPhase = 'intro' | 'recording' | 'captured';
type CardStyle = 'minimal' | 'neon' | 'karaoke';

type RoundResult = {
  targetFreq: number;
  avgCentsError: number;
  instabilityPenalty: number;
  silencePenalty: number;
  score: number;
};

type HistoryRecord = {
  date: string;
  score: number;
  level: string;
};

type LeaderRecord = {
  id: string;
  score: number;
};

type VocalRange = {
  low: number | null;
  high: number | null;
};

function gradeFromAbsCents(absCents: number): PitchGrade {
  if (absCents < 5) return 'perfect';
  if (absCents < 15) return 'great';
  if (absCents < 30) return 'good';
  return 'bad';
}

function starsFromAbsCents(absCents: number): number {
  const g = gradeFromAbsCents(absCents);
  switch (g) {
    case 'perfect': return 5;
    case 'great': return 4;
    case 'good': return 3;
    default: return 2;
  }
}

function starsFromScore(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  return 1;
}

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getCachedMicStream(): MediaStream | null {
  const w: any = window as any;
  const s: MediaStream | undefined = w.__mvgMicStream;
  if (!s) return null;
  const live = s.getAudioTracks().some((t) => t.readyState === 'live');
  return live ? s : null;
}

async function getMicStream(): Promise<MediaStream> {
  const cached = getCachedMicStream();
  if (cached) return cached;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  (window as any).__mvgMicStream = stream;
  return stream;
}

function freqToNote(freq: number): string {
  if (!Number.isFinite(freq) || freq <= 0) return '—';
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const note = noteNames[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function hzToMidi(freq: number): number {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function hzToCentsDiff(freq: number, target: number): number {
  if (freq <= 0 || target <= 0) return 1200;
  return 1200 * Math.log2(freq / target);
}

function levelFromScore(score: number): string {
  if (score >= 85) return 'Профи';
  if (score >= 60) return 'Средний';
  return 'Новичок';
}

function isRangeValid(low: number | null, high: number | null): boolean {
  if (!low || !high || !Number.isFinite(low) || !Number.isFinite(high)) return false;
  if (high <= low) return false;
  return hzToMidi(high) - hzToMidi(low) >= 4;
}

function pickTargetFrequency(range: VocalRange, difficulty: Difficulty, roundIndex: number): number {
  const fallback = 220;
  if (!isRangeValid(range.low, range.high)) return fallback;

  const low = range.low as number;
  const high = range.high as number;
  const lowMidi = hzToMidi(low);
  const highMidi = hzToMidi(high);
  const span = Math.max(1, highMidi - lowMidi);
  const center = Math.round((lowMidi + highMidi) / 2);

  let minMidi = lowMidi;
  let maxMidi = highMidi;

  if (difficulty === 'newbie') {
    if (roundIndex === 0) return midiToHz(center);
    if (roundIndex === 1) {
      const jitter = Math.floor(Math.random() * 3) - 1;
      return midiToHz(clamp(center + jitter, lowMidi, highMidi));
    }
    minMidi = Math.round(lowMidi + span * 0.2);
    maxMidi = Math.round(lowMidi + span * 0.75);
  } else {
    minMidi = Math.round(lowMidi + span * 0.1);
    maxMidi = Math.round(lowMidi + span * 0.9);
  }

  if (maxMidi < minMidi) {
    minMidi = lowMidi;
    maxMidi = highMidi;
  }

  const midi = minMidi + Math.floor(Math.random() * (maxMidi - minMidi + 1));
  return midiToHz(midi);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function MiniVocalGame({ user, onSubmitScore }: { user?: any; onSubmitScore?: (p: { score: number; accuracy: number }) => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('newbie');
  const [calibStep, setCalibStep] = useState<CalibStep>('low');
  const [calibLeftMs, setCalibLeftMs] = useState(CALIBRATION_MS);
  const [calibrationPhase, setCalibrationPhase] = useState<CalibrationPhase>('intro');
  const [calibrationPreview, setCalibrationPreview] = useState<number | null>(null);
  const [range, setRange] = useState<VocalRange>({ low: null, high: null });
  const [micReady, setMicReady] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [hasCalibration, setHasCalibration] = useState(false);
  const [calibrationError, setCalibrationError] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('mv_onboard_v21') !== '1'; } catch { return true; }
  });

  const [pitch, setPitch] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [volume, setVolume] = useState(0);
  const [pitchStable, setPitchStable] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [targetFreq, setTargetFreq] = useState(220);
  const [holding, setHolding] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [pauseMsg, setPauseMsg] = useState('');
  const [results, setResults] = useState<RoundResult[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [streak, setStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderRecord[]>([]);
  const [cardStyle, setCardStyle] = useState<CardStyle>('minimal');
  const [template, setTemplate] = useState<'template_a' | 'template_b'>('template_a');
  const [liveAccuracy, setLiveAccuracy] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [lastRoundScore, setLastRoundScore] = useState<number | null>(null);

  const liveCents = useMemo(() => (pitch > 0 && targetFreq > 0 ? hzToCentsDiff(pitch, targetFreq) : 0), [pitch, targetFreq]);
  const liveStars = useMemo(() => {
    if (pitch <= 0 || confidence < 0.6) return 0;
    return starsFromAbsCents(Math.abs(liveCents || 0));
  }, [pitch, confidence, liveCents]);

  const stageRef = useRef(stage);
  const difficultyRef = useRef(difficulty);
  const calibStepRef = useRef(calibStep);
  const rangeRef = useRef(range);
  const calibrationPhaseRef = useRef(calibrationPhase);
  const targetFreqRef = useRef(targetFreq);
  const holdingRef = useRef(holding);
  const autoPausedRef = useRef(autoPaused);
  const roundIndexRef = useRef(roundIndex);
  const submittedRef = useRef(false);
  const lastUiTickRef = useRef(0);
  const lastPitchRef = useRef(0);
  const lastConfidenceRef = useRef(0);
  const lastVolumeRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pitchEngineRef = useRef<PitchEngine | null>(null);
  const pitchEngineV2Ref = useRef<PitchEngineV2 | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothHzRef = useRef<number | null>(null);
  const hzRingRef = useRef<Float64Array | null>(null);
  const hzRingTmpRef = useRef<Float64Array | null>(null);
  const hzRingIdxRef = useRef(0);
  const hzRingCountRef = useRef(0);
  const emaHzRef = useRef<number | null>(null);
  const audioBufferRef = useRef<Parameters<AnalyserNode['getFloatTimeDomainData']>[0] | null>(null);
  const referenceToneRef = useRef<ReferenceToneHandle | null>(null);

  const calibCollectedRef = useRef<number[]>([]);
  const calibStartRef = useRef<number>(0);

  const holdStartRef = useRef<number>(0);
  const pauseStartedAtRef = useRef<number>(0);
  const pausedAccumulatedMsRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const centsSamplesRef = useRef<number[]>([]);
  const totalSilentMsRef = useRef<number>(0);

  const tracePointsRef = useRef<PitchPoint[]>([]);
  const [pitchRoadPoints, setPitchRoadPoints] = useState<PitchPoint[]>([]);
  const lastRoadTickRef = useRef<number>(0);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { calibStepRef.current = calibStep; }, [calibStep]);
  useEffect(() => { rangeRef.current = range; }, [range]);
  useEffect(() => { calibrationPhaseRef.current = calibrationPhase; }, [calibrationPhase]);
  useEffect(() => { targetFreqRef.current = targetFreq; }, [targetFreq]);
  useEffect(() => { holdingRef.current = holding; }, [holding]);
  useEffect(() => { autoPausedRef.current = autoPaused; }, [autoPaused]);
  useEffect(() => { roundIndexRef.current = roundIndex; }, [roundIndex]);

  useEffect(() => {
    return () => {
      stopReferenceTone();
    };
  }, []);

  useEffect(() => {
    const h = safeJsonParse<HistoryRecord[]>(localStorage.getItem(HISTORY_KEY), []);
    const s = safeJsonParse<{ count?: number }>(localStorage.getItem(STREAK_KEY), { count: 0 });
    const b = safeJsonParse<LeaderRecord[]>(localStorage.getItem(BOARD_KEY), []);
    setHistory(Array.isArray(h) ? h : []);
    setStreak(typeof s.count === 'number' ? s.count : 0);
    setLeaderboard(Array.isArray(b) ? b : []);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      audioCtxRef.current?.close().catch(() => undefined);
    };
  }, []);

  const stopReferenceTone = () => {
    try {
      referenceToneRef.current?.stop();
    } catch {}
    referenceToneRef.current = null;
  };

  const resetPitchSmoothing = () => {
    smoothHzRef.current = null;
    hzRingIdxRef.current = 0;
    hzRingCountRef.current = 0;
    emaHzRef.current = null;
    pitchEngineRef.current?.resetSmoothing();
    pitchEngineV2Ref.current?.reset();
  };

  const connectMic = async () => {
    if (audioCtxRef.current && analyserRef.current && streamRef.current) {
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      setMicReady(true);
      return;
    }

    const stream = await getMicStream();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    streamRef.current = stream;
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const tick = () => {
      const analyserNode = analyserRef.current;
      const ctx = audioCtxRef.current;
      if (!analyserNode || !ctx) return;

      if (!audioBufferRef.current || audioBufferRef.current.length !== analyserNode.fftSize) {
        audioBufferRef.current = new Float32Array(analyserNode.fftSize) as Parameters<AnalyserNode['getFloatTimeDomainData']>[0];
      }
      const buffer = audioBufferRef.current;

      if (!pitchEngineRef.current || pitchEngineRef.current.bufferSize !== analyserNode.fftSize) {
        pitchEngineRef.current = new PitchEngine({
          sampleRate: ctx.sampleRate,
          bufferSize: analyserNode.fftSize,
          minHz: 80,
          maxHz: 1000,
          threshold: 0.15,
          minProbability: 0.1,
          emaAlpha: 0,
        });
      }
      if (!pitchEngineV2Ref.current) {
        pitchEngineV2Ref.current = new PitchEngineV2({
          sampleRate: ctx.sampleRate,
          minHz: 80,
          maxHz: 1000,
          minRms: 0.01,
          minConfidence: 0.58,
          smoothingAlpha: 0.18,
          jumpRejectCents: 180,
        });
      }

      analyserNode.getFloatTimeDomainData(buffer);
      const frame = pitchEngineV2Ref.current.process(buffer, (input) => {
        const raw = pitchEngineRef.current?.process(input) ?? null;
        return { hz: raw?.hz ?? null, confidence: raw?.probability ?? 0 };
      });
      const rms = frame.rms ?? 0;
      const prob = frame.confidence ?? 0;
      lastConfidenceRef.current = prob;
      lastVolumeRef.current = rms;

      const voiced = frame.voiced && prob >= 0.58 && rms >= 0.01;
      const hz = voiced && frame.hz ? frame.hz : 0;
      if (!hz) resetPitchSmoothing();

      lastPitchRef.current = hz;
      const p = hz;
      const currentStage = stageRef.current;
      const currentTarget = targetFreqRef.current;
      const isHolding = holdingRef.current;
      const isAutoPaused = autoPausedRef.current;

      if (currentStage === 'game' && !isAutoPaused && frame.voiced && prob >= 0.45 && rms >= 0.008 && p > 0) {
        const now = performance.now();
        const centsRaw = hzToCentsDiff(p, currentTarget);
        const cents = clamp(centsRaw, -60, 60);
        const grade = gradeFromAbsCents(Math.abs(centsRaw));
        tracePointsRef.current.push({ t: now, cents, grade });
        const cutoff = now - ROAD_CULL_MS;
        if (tracePointsRef.current.length > ROAD_MAX_POINTS) {
          tracePointsRef.current = tracePointsRef.current.filter((pt: PitchPoint) => pt.t >= cutoff).slice(-ROAD_MAX_POINTS);
        }
        if (now - (lastRoadTickRef.current || 0) > ROAD_TICK_MS) {
          lastRoadTickRef.current = now;
          setPitchRoadPoints([...tracePointsRef.current]);
        }
      }

      if (currentStage === 'calibration' && calibrationPhaseRef.current === 'recording') {
        if (p > 0 && prob >= 0.55 && rms >= 0.01) {
          calibCollectedRef.current.push(p);
        }
      }

      if (currentStage === 'game' && isHolding && !isAutoPaused) {
        const now = performance.now();
        const silent = rms < 0.012 || p <= 0;

        if (silent) {
          if (!silenceStartRef.current) silenceStartRef.current = now;
          if (now - silenceStartRef.current > SILENCE_AUTOPAUSE_MS) {
            totalSilentMsRef.current += now - silenceStartRef.current;
            pauseStartedAtRef.current = now;
            setAutoPaused(true);
            setPauseMsg('Автопауза: звук пропал более 1 секунды. Нажмите «Продолжить».');
          }
        } else {
          silenceStartRef.current = 0;
          centsSamplesRef.current.push(hzToCentsDiff(p, currentTarget));
        }

        const centsErr = p > 0 ? Math.abs(hzToCentsDiff(p, currentTarget)) : 1200;
        const accuracyPct = clamp(100 - centsErr * 2, 0, 100);
        const elapsedHold = now - holdStartRef.current - pausedAccumulatedMsRef.current;
        const progress = clamp(elapsedHold / ROUND_MS, 0, 1);

        if (now - (lastUiTickRef.current || 0) > UI_TICK_MS) {
          lastUiTickRef.current = now;
          setPitch(lastPitchRef.current);
          setConfidence(lastConfidenceRef.current);
          setVolume(lastVolumeRef.current);
        setPitchStable(frame.stable);
          setPitchStable(frame.stable);
          setLiveAccuracy(Math.round(accuracyPct));
          setHoldProgress(progress);
        }

        if (elapsedHold >= ROUND_MS) {
          finishRound();
        }
      }

      if (performance.now() - (lastUiTickRef.current || 0) > UI_TICK_MS && (!isHolding || isAutoPaused || currentStage !== 'game')) {
        lastUiTickRef.current = performance.now();
        setPitch(lastPitchRef.current);
        setConfidence(lastConfidenceRef.current);
        setVolume(lastVolumeRef.current);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
    setMicReady(true);
  };

  const prepareRound = (idx: number) => {
    stopReferenceTone();
    setRoundIndex(idx);

    const currentRange = rangeRef.current;
    const currentDifficulty = difficultyRef.current;
    const nextTarget = pickTargetFrequency(currentRange, currentDifficulty, idx);
    setTargetFreq(nextTarget);

    setHolding(false);
    holdingRef.current = false;
    setAutoPaused(false);
    autoPausedRef.current = false;
    setPauseMsg('');
    setLiveAccuracy(0);
    setHoldProgress(0);
    setLastRoundScore(null);

    holdStartRef.current = 0;
    pauseStartedAtRef.current = 0;
    pausedAccumulatedMsRef.current = 0;
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
    tracePointsRef.current = [];
    lastRoadTickRef.current = 0;
    setPitchRoadPoints([]);
  };

  const beginCalibration = async () => {
    if (!micReady) {
      await connectMic();
    }
    stopReferenceTone();
    setCalibrationError('');
    setHasCalibration(false);
    setRange({ low: null, high: null });
    setStage('calibration');
    setCalibStep('low');
    setCalibrationPhase('intro');
    setCalibrationPreview(null);
    setCalibLeftMs(CALIBRATION_MS);
    calibCollectedRef.current = [];
  };

  const startCalibrationStep = () => {
    setCalibrationError('');
    setCalibrationPhase('recording');
    setCalibrationPreview(null);
    setCalibLeftMs(CALIBRATION_MS);
    calibCollectedRef.current = [];
    calibStartRef.current = performance.now();
  };

  const moveToDifficulty = async () => {
    if (!micReady) await connectMic();
    setStage('difficulty');
  };

  const finalizeCalibrationStep = (step: CalibStep) => {
    const samples = calibCollectedRef.current.filter((f: number) => f > 0 && Number.isFinite(f));
    calibCollectedRef.current = [];
    if (samples.length < 6) return null;
    samples.sort((a: number, b: number) => a - b);
    return samples[Math.floor(samples.length / 2)];
  };

  useEffect(() => {
    if (stage !== 'calibration' || calibStep === 'done' || calibrationPhase !== 'recording') return;

    let timer = 0;
    const loop = () => {
      const elapsed = performance.now() - calibStartRef.current;
      const left = clamp(CALIBRATION_MS - elapsed, 0, CALIBRATION_MS);
      setCalibLeftMs(left);

      if (left <= 0) {
        const captured = finalizeCalibrationStep(calibStepRef.current);

        if (!captured) {
          setCalibrationPreview(null);
          setCalibrationPhase('intro');
          setCalibrationError('Калибровка не удалась. Пойте громче и стабильнее.');
          return;
        }

        if (calibStepRef.current === 'low') {
          setRange({ low: captured, high: null });
          setCalibrationPreview(captured);
          setCalibrationPhase('captured');
          return;
        }

        const low = rangeRef.current.low;
        const high = captured;
        if (!isRangeValid(low, high)) {
          setHasCalibration(false);
          setRange({ low: null, high: null });
          setCalibrationPreview(null);
          setCalibrationPhase('intro');
          setCalibStep('low');
          setCalibrationError('Диапазон определён неверно. Повторите калибровку громче и ровнее.');
          return;
        }

        const finalRange = { low, high } as VocalRange;
        setRange(finalRange);
        setHasCalibration(true);
        setCalibrationPreview(captured);
        setCalibrationPhase('captured');
        setCalibStep('done');
        return;
      }

      timer = window.setTimeout(loop, 80);
    };

    loop();
    return () => window.clearTimeout(timer);
  }, [stage, calibStep, calibrationPhase]);

  const startGameFromSetup = async () => {
    if (!micReady) {
      await connectMic();
    }
    if (!hasCalibration || !isRangeValid(rangeRef.current.low, rangeRef.current.high)) {
      setStage('difficulty');
      return;
    }
    setStage('game');
    prepareRound(0);
  };

  const confirmDifficulty = async () => {
    if (!micReady) await connectMic();
    await beginCalibration();
  };

  const handleCalibrationContinue = () => {
    setCalibrationError('');
    if (calibStep === 'low') {
      setCalibStep('high');
      setCalibrationPhase('intro');
      setCalibrationPreview(null);
      setCalibLeftMs(CALIBRATION_MS);
      calibCollectedRef.current = [];
      return;
    }

    setStage('game');
    prepareRound(0);
  };

  const playReferenceTone = async () => {
    try {
      if (!audioCtxRef.current) {
        await connectMic();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
      stopReferenceTone();
      referenceToneRef.current = startReferenceTone(ctx, targetFreqRef.current, 60_000, 0.1);
    } catch {}
  };

  const startHold = () => {
    if (autoPausedRef.current) return;
    setLastRoundScore(null);
    setLiveAccuracy(0);
    setHoldProgress(0);
    lastUiTickRef.current = 0;
    setHolding(true);
    holdingRef.current = true;
    holdStartRef.current = performance.now();
    pauseStartedAtRef.current = 0;
    pausedAccumulatedMsRef.current = 0;
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
    tracePointsRef.current = [];
    lastRoadTickRef.current = 0;
    setPitchRoadPoints([]);
  };

  const stopHold = () => {
    setHolding(false);
    holdingRef.current = false;
  };

  const resumeAfterPause = () => {
    if (pauseStartedAtRef.current) {
      pausedAccumulatedMsRef.current += performance.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = 0;
    }
    silenceStartRef.current = 0;
    setAutoPaused(false);
    autoPausedRef.current = false;
  };

  const finishRound = () => {
    stopHold();
    const samples = centsSamplesRef.current;
    const avgAbsCents = samples.length
      ? samples.reduce((a, b) => a + Math.abs(b), 0) / samples.length
      : 1200;
    const meanSigned = samples.length
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : 0;
    const stdev = samples.length
      ? Math.sqrt(samples.reduce((acc, c) => acc + (c - meanSigned) ** 2, 0) / samples.length)
      : 200;

    const currentDifficulty = difficultyRef.current;
    const tolerance = currentDifficulty === 'newbie' ? 70 : 35;
    const stabilityWeight = currentDifficulty === 'newbie' ? 0.08 : 0.16;

    const baseAccuracy = clamp(100 - (avgAbsCents / tolerance) * 100, 0, 100);
    const instabilityPenalty = clamp(stdev * stabilityWeight, 0, 40);
    const silencePenalty = clamp((totalSilentMsRef.current / ROUND_MS) * 45, 0, 45);
    const score = clamp(baseAccuracy - instabilityPenalty - silencePenalty, 0, 100);
    setLastRoundScore(Math.round(score));

    const one: RoundResult = {
      targetFreq: targetFreqRef.current,
      avgCentsError: avgAbsCents,
      instabilityPenalty,
      silencePenalty,
      score,
    };

    setResults((prev) => {
      const next: RoundResult[] = [...prev, one];
      if (next.length >= TOTAL_ROUNDS) {
        finishGame(next);
      } else {
        window.setTimeout(() => prepareRound(next.length), 500);
      }
      return next;
    });
  };

  const finishGame = (finalRounds: RoundResult[]) => {
    const finalScore = finalRounds.reduce((a: number, r: RoundResult) => a + r.score, 0) / finalRounds.length;
    const level = levelFromScore(finalScore);
    const record: HistoryRecord = {
      date: new Date().toISOString(),
      score: Math.round(finalScore),
      level,
    };

    const nextHistory: HistoryRecord[] = [record, ...history].slice(0, 5);
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

    const now = todayISO();
    const streakState = safeJsonParse<{ count?: number; date?: string }>(localStorage.getItem(STREAK_KEY), { count: 0 });
    const prevDate = typeof streakState.date === 'string' ? streakState.date : '';
    const diffDays = prevDate ? Math.floor((+new Date(now) - +new Date(prevDate)) / 86400000) : 0;
    const count = !prevDate ? 1 : diffDays <= 0 ? (streakState.count ?? 0) : diffDays === 1 ? (streakState.count ?? 0) + 1 : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ count, date: now }));
    setStreak(count);

    const weekTag = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}`;
    const boardRaw = safeJsonParse<Array<LeaderRecord & { week: string }>>(localStorage.getItem(BOARD_KEY), []);
    const board = [...boardRaw, { id: user?.id || `anon-${Math.random().toString(36).slice(2, 7)}`, score: Math.round(finalScore), week: weekTag }]
      .filter((x) => x.week === weekTag)
      .sort((a: LeaderRecord & { week: string }, b: LeaderRecord & { week: string }) => b.score - a.score)
      .slice(0, 5);
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
    setLeaderboard(board.map(({ id, score }) => ({ id, score })));

    setStage('results');
  };

  const finalScore = useMemo(() => {
    if (!results.length) return 0;
    return Math.round(results.reduce((a: number, r: RoundResult) => a + r.score, 0) / results.length);
  }, [results]);

  const finalAccuracy = useMemo(() => {
    if (!results.length) return 0;
    const meanErr = results.reduce((a: number, r: RoundResult) => a + Math.abs(r.avgCentsError), 0) / results.length;
    return Math.max(0, Math.min(1, 1 - meanErr / 50));
  }, [results]);

  useEffect(() => {
    if (stage !== 'results') return;
    if (!onSubmitScore) return;
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmitScore({ score: Math.round(finalScore), accuracy: finalAccuracy });
  }, [stage, onSubmitScore, finalScore, finalAccuracy]);

  const level = levelFromScore(finalScore);
  const volumeHint = volume < 0.012 ? 'Слишком тихо' : volume > 0.11 ? 'Слишком громко' : 'Нормальный уровень';

  const utmUrl = useMemo(() => {
    const params = new URLSearchParams({
      utm_source: 'instagram',
      utm_medium: 'stories',
      utm_campaign: 'vocal_challenge',
      utm_content: template,
    });
    return `https://www.instagram.com/vocal.jivoizvuk.ekb/?${params.toString()}`;
  }, [template]);

  const dmText = encodeURIComponent(`Привет! Я прошёл Mini Vocal Challenge, получил ${finalScore} (${level}). Хочу разбор и план роста 🎤`);
  const lessonUrl = 'https://www.instagram.com/vocal.jivoizvuk.ekb/';
  const offer =
    level === 'Новичок'
      ? 'Оффер: диагностика + базовый план за 20 минут.'
      : level === 'Средний'
      ? 'Оффер: персональный апгрейд диапазона и стабильности.'
      : 'Оффер: прокачка артистизма + запись демо-куплета.';

  const generateCardBlob = async (): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    if (cardStyle === 'minimal') {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.fillStyle = '#f5f5f5';
    } else if (cardStyle === 'neon') {
      const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
      grad.addColorStop(0, '#020024');
      grad.addColorStop(1, '#f72585');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.fillStyle = '#00f5d4';
    } else {
      ctx.fillStyle = '#10002b';
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.fillStyle = '#ffba08';
    }

    ctx.font = 'bold 72px sans-serif';
    ctx.fillText('Mini Vocal Challenge', 90, 220);
    ctx.font = 'bold 180px sans-serif';
    ctx.fillText(String(finalScore), 90, 500);
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText(level, 90, 640);
    ctx.font = '42px sans-serif';
    ctx.fillText('Add Yours: "Мой вокальный уровень"', 90, 760);
    ctx.fillText('@vocal.jivoizvuk.ekb', 90, 840);
    ctx.fillText('Добавь link sticker:', 90, 920);
    ctx.fillText(utmUrl, 90, 980);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG generation failed'))), 'image/png');
    });
  };

  const shareResultText = async () => {
    const text = `🎤 Мой результат: ${finalScore} (${level}). Сможешь лучше?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MiniVocalGame', text, url: window.location.href });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${text} ${utmUrl}`);
      alert('Текст результата скопирован в буфер обмена.');
    } catch {
      alert(text);
    }
  };

  const shareToStories = async () => {
    const blob = await generateCardBlob();
    const file = new File([blob], 'mini-vocal-result.png', { type: 'image/png' });
    const shareData: ShareData = { files: [file], text: `Мой результат: ${finalScore} (${level})` };

    if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
      await navigator.share(shareData);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mini-vocal-result.png';
    a.click();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard.writeText(`Сторис текст: Мой результат ${finalScore} (${level}). Link: ${utmUrl}`);
      alert('PNG скачан. Текст скопирован в буфер. Опубликуйте в IG Stories вручную.');
    } catch {
      alert('PNG скачан. Опубликуйте в IG Stories вручную.');
    }
  };

  const resetAll = () => {
    stopReferenceTone();
    setStage('setup');
    setCalibStep('low');
    setCalibrationPhase('intro');
    setCalibrationPreview(null);
    setCalibLeftMs(CALIBRATION_MS);
    setRange({ low: null, high: null });
    setHasCalibration(false);
    setCalibrationError('');
    setRoundIndex(0);
    setResults([]);
    setHolding(false);
    holdingRef.current = false;
    setAutoPaused(false);
    autoPausedRef.current = false;
    setPauseMsg('');
    setLiveAccuracy(0);
    setHoldProgress(0);
    setLastRoundScore(null);
    holdStartRef.current = 0;
    pauseStartedAtRef.current = 0;
    pausedAccumulatedMsRef.current = 0;
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
    tracePointsRef.current = [];
    setPitchRoadPoints([]);
    submittedRef.current = false;
  };

  return (
    <div className="v5Shell v6Shell">
      <div className="v5Backdrop" aria-hidden />
      <div className={`v5Card v6GameCard ${stage === 'game' ? 'v6GameCard--play' : ''}`}>
        {stage !== 'game' ? <h1>MiniVocalGame — вокальный челлендж</h1> : null}

        {showOnboarding && stage === 'game' && roundIndex === 0 ? (
          <div className="onboardOverlay" role="dialog" aria-modal="true">
            <div className="onboardCard">
              <div className="onboardTitle">Как играть</div>
              <ol className="onboardSteps">
                <li>Нажмите <b>«Включить микрофон»</b> и разрешите доступ.</li>
                <li>Нажмите и удерживайте <b>«Удерживать ноту»</b>.</li>
                <li>Пойте ноту <b>{freqToNote(targetFreq)}</b> около <b>{Math.round(ROUND_MS / 1000)} сек</b> — получите ⭐ и очки.</li>
              </ol>
              <div className="onboardActions">
                <button
                  className="primary"
                  onClick={() => {
                    try { localStorage.setItem('mv_onboard_v21', '1'); } catch {}
                    setShowOnboarding(false);
                  }}
                >
                  Понятно
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {stage === 'setup' && (
          <section className="homeGameSetup">
            <div className="homeGameTitle">🎤 MiniVocalGame</div>
            <div className="homeGameSubtitle">Пой в ноту. Получай ⭐. Делись результатом.</div>
            <div className="homeGameHint">При первом старте игра сначала попросит откалибровать диапазон голоса.</div>
            {calibrationError ? <div className="warning calibrationWarning">{calibrationError}</div> : null}

            <div className="homeGamePrimary">
              <button className="homeGameMicBtn" type="button" onClick={() => moveToDifficulty()}>
                <span className="homeGameMicIcon">🎙️</span>
                <span className="homeGameMicText">{micReady ? 'Дальше' : 'Включить микрофон'}</span>
              </button>
              <div className="homeGameHint">
                {micReady ? 'Микрофон готов. Дальше будет выбор сложности и калибровка.' : 'При первом запуске нужно разрешить доступ к микрофону.'}
              </div>
            </div>

            <button type="button" className="homeGameAdvancedToggle" onClick={() => setShowAdvancedSetup((v: boolean) => !v)}>
              {showAdvancedSetup ? 'Скрыть настройки' : 'Настройки'}
            </button>

            {showAdvancedSetup ? (
              <div className="homeGameAdvanced">

                <div className="homeGameRowBtns">
                  <button onClick={connectMic} disabled={micReady} type="button">
                    {micReady ? 'Микрофон подключён' : 'Подключить микрофон'}
                  </button>
                  <button onClick={beginCalibration} disabled={!micReady} type="button">
                    Калибровка диапазона
                  </button>
                </div>

                <div className="homeGameFinePrint">Калибровка улучшает подбор нот под ваш голос.</div>
              </div>
            ) : null}
          </section>
        )}

        {stage === 'difficulty' && (
          <section className="v6Section v6Section--centered">
            <h2>Выберите сложность</h2>
            <p className="centerText">Сложность вынесена на отдельный экран, чтобы старт игры был понятнее и спокойнее.</p>
            <div className="difficultyGrid">
              <button type="button" className={`difficultyCard ${difficulty === 'newbie' ? 'difficultyCard--active' : ''}`} onClick={() => setDifficulty('newbie')}>
                <strong>Новичок</strong>
                <span>Комфортные цели из середины диапазона.</span>
              </button>
              <button type="button" className={`difficultyCard ${difficulty === 'pro' ? 'difficultyCard--active' : ''}`} onClick={() => setDifficulty('pro')}>
                <strong>Профи</strong>
                <span>Шире диапазон целей и строже оценка.</span>
              </button>
            </div>
            <div className="calibrationActions">
              <button type="button" onClick={() => setStage('setup')}>Назад</button>
              <button type="button" className="primary" onClick={confirmDifficulty}>Продолжить к калибровке</button>
            </div>
          </section>
        )}

        {stage === 'calibration' && (
          <section className="v6Section v6Section--centered">
            <h2>Калибровка диапазона</h2>
            <div className="calibrationStepBadge">Шаг {calibStep === 'low' ? '1 / 2' : calibStep === 'high' ? '2 / 2' : 'готово'}</div>
            <h3 className="calibrationHeadline">{calibStep === 'low' ? 'Спойте самую низкую комфортную ноту' : calibStep === 'high' ? 'Спойте самую высокую комфортную ноту' : 'Калибровка завершена'}</h3>
            <p className="centerText">{calibStep === 'low' ? 'Не напрягайтесь. Нужна устойчивая комфортная нота.' : 'Спойте высокий, но удобный для вас звук. Держите его ровно.'}</p>
            {calibrationError ? <div className="warning calibrationWarning">{calibrationError}</div> : null}

            {calibrationPhase === 'intro' && calibStep !== 'done' ? (
              <>
                <div className="calibrationInfo">
                  <div><strong>Что делать:</strong> пойте 4–5 секунд после нажатия кнопки.</div>
                  <div><strong>Подсказка:</strong> {volumeHint}</div>
                  <div><strong>Сейчас слышим:</strong> {freqToNote(pitch)} ({Math.round(pitch) || 0} Hz)</div>
                </div>
                <div className="calibrationActions">
                  <button type="button" onClick={() => setStage('difficulty')}>Назад</button>
                  <button type="button" className="primary" onClick={startCalibrationStep}>Начать шаг</button>
                </div>
              </>
            ) : null}

            {calibrationPhase === 'recording' ? (
              <>
                <div className="calibrationTimer">Осталось: {(calibLeftMs / 1000).toFixed(1)} c</div>
                <div className="calibrationInfo">
                  <div><strong>Текущая нота:</strong> {freqToNote(pitch)}</div>
                  <div><strong>Частота:</strong> {Math.round(pitch) || 0} Hz</div>
                  <div><strong>Громкость:</strong> {volumeHint}</div>
                </div>
              </>
            ) : null}

            {calibrationPhase === 'captured' ? (
              <>
                <div className="calibrationSuccess">✓ Нота записана: <strong>{freqToNote(calibrationPreview || 0)}</strong> ({Math.round(calibrationPreview || 0)} Hz)</div>
                <div className="calibrationActions">
                  {calibStep === 'done' ? (
                    <button type="button" className="primary" onClick={handleCalibrationContinue}>Начать игру</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setCalibrationPhase('intro')}>Повторить шаг</button>
                      <button type="button" className="primary" onClick={handleCalibrationContinue}>Дальше</button>
                    </>
                  )}
                </div>
              </>
            ) : null}
          </section>
        )}

        {stage === 'game' && (
          <section className="v6Section">
            <h2>Раунд {roundIndex + 1} / {TOTAL_ROUNDS}</h2>
            <div className="v7GameGrid">
              <div className="v7Ring">
                <PitchRingSmule cents={liveCents} note={freqToNote(pitch)} hz={pitch} confidence={confidence} />
              </div>

              <div className="v7Hud">
                <HUDPanel
                  liveHz={pitch}
                  target={freqToNote(targetFreq)}
                  stars={liveStars}
                  confidence={confidence}
                  streak={streak}
                  stable={pitchStable}
                />

                <div className="hudToneRow">
                  <button
                    className="badge btn metricCell metricCell--tone"
                    title={t('hud.playTone')}
                    onMouseDown={playReferenceTone}
                    onMouseUp={stopReferenceTone}
                    onMouseLeave={stopReferenceTone}
                    onTouchStart={(e) => { e.preventDefault(); void playReferenceTone(); }}
                    onTouchEnd={stopReferenceTone}
                    onTouchCancel={stopReferenceTone}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        void playReferenceTone();
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        stopReferenceTone();
                      }
                    }}
                  >🔊 {t('hud.playTone')}</button>
                </div>

                {holding ? (
                  <div>
                    <ScoreMeter value={liveAccuracy} max={100} label={t('hud.accuracy')} />
                    <div className="holdProgress">
                      <div className="holdProgressBar" style={{ width: `${Math.round(holdProgress * 100)}%` }} />
                    </div>
                    <div className="hint subtle">
                      {t('hud.holdHint')} <strong>{Math.max(0, Math.ceil((ROUND_MS - (performance.now() - holdStartRef.current - pausedAccumulatedMsRef.current)) / 1000))}</strong>s
                    </div>
                  </div>
                ) : (
                  <div className="hint">
                    {t('hud.holdToScore')}
                    {lastRoundScore !== null ? <div className="hintScore">{t('hud.roundScore')}: <strong>{lastRoundScore}</strong></div> : null}
                  </div>
                )}
              </div>
            </div>

            <PitchRoad points={pitchRoadPoints} windowMs={4500} />

            <p>{volumeHint}</p>
            {autoPaused ? (
              <>
                <p className="warning">{pauseMsg}</p>
                <button onClick={resumeAfterPause}>Продолжить</button>
              </>
            ) : (
              <button
                className={holding ? 'hold active' : 'hold'}
                onMouseDown={startHold}
                onMouseUp={stopHold}
                onMouseLeave={stopHold}
                onTouchStart={(e) => { e.preventDefault(); startHold(); }}
                onTouchEnd={stopHold}
                onTouchCancel={stopHold}
              >
                {holding ? 'Удерживайте ноту…' : 'Удерживать ноту'}
              </button>
            )}
          </section>
        )}

        {stage === 'results' && (
          <section className="v6Section v6Section--results">
            <h2>Результаты</h2>
            <div className="resultGrid">
              <div className="resultRow"><span>Итоговый счёт</span><strong>{finalScore}</strong></div>
              <div className="resultRow"><span>Награда</span><strong>{'⭐'.repeat(starsFromScore(finalScore))}</strong></div>
              <div className="resultRow"><span>Уровень</span><strong>{level}</strong></div>
              <div className="resultRow resultRow--text"><span>Лучший CTA</span><div>{offer}</div></div>
            </div>

            <div className="shareRow">
              <button onClick={shareToStories}>Поделиться в Stories</button>
              <button onClick={shareResultText}>Поделиться текстом</button>
              <a className="dm" href={`https://ig.me/m/vocal.jivoizvuk.ekb?text=${dmText}`} target="_blank" rel="noreferrer">Открыть DM</a>
            </div>

            <div className="studioCta">
              <div className="studioCta__title">Хочешь поднять результат?</div>
              <div className="studioCta__text">Запишись на урок в студию: разберём дыхание, интонацию и подберём упражнения под твой диапазон.</div>
              <a className="studioCta__button" href={lessonUrl} target="_blank" rel="noreferrer">Записаться на урок в студию</a>
            </div>

            <h3>Последние игры</h3>
            <ul>{history.map((h: HistoryRecord) => <li key={h.date}>{new Date(h.date).toLocaleString()} — {h.score} ({h.level})</li>)}</ul>
            <p>Ежедневная серия: {streak} 🔥</p>

            <h3>Недельный рейтинг (локальный топ‑5)</h3>
            <ol>{leaderboard.map((x: LeaderRecord) => <li key={x.id}>{x.id}: {x.score}</li>)}</ol>

            <button onClick={resetAll}>Полный перезапуск челленджа</button>
          </section>
        )}
      </div>
    </div>
  );
}
