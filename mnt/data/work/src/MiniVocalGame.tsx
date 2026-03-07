import { useEffect, useMemo, useRef, useState } from 'react';
import { PitchRingSmule } from './components/PitchRingSmule';
import { ScoreMeter } from './components/ScoreMeter';
import PitchRoad, { type PitchGrade, type PitchPoint } from './components/PitchRoad';
import { PitchEngine } from './audio/PitchEngine';
import { playReferenceTone as startReferenceTone, type ReferenceToneHandle } from './utils/referenceTone';
import { useI18n } from './i18n';

const TOTAL_ROUNDS = 5;
const CALIBRATION_MS = 4000;
const ROUND_MS = 2500;
const SILENCE_AUTOPAUSE_MS = 1000;
const HISTORY_KEY = 'mini-vocal-history';
const STREAK_KEY = 'mini-vocal-streak';
const BOARD_KEY = 'mini-vocal-weekly-board';

type Stage = 'setup' | 'difficulty' | 'calibration' | 'game' | 'results';
type Difficulty = 'newbie' | 'pro';
type CalibStep = 'low' | 'high';
type CardStyle = 'minimal' | 'neon' | 'karaoke';
type CalibrationView = 'intro' | 'capture';

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

type VocalRange = { low: number | null; high: number | null };

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

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

function isRangeValid(range: VocalRange): boolean {
  if (!range.low || !range.high) return false;
  if (range.high <= range.low) return false;
  return hzToMidi(range.high) - hzToMidi(range.low) >= 4;
}

function pickTargetFrequency(range: VocalRange, difficulty: Difficulty, roundIdx: number): number {
  const low = range.low ?? 165;
  const high = range.high ?? 330;
  const lowMidi = hzToMidi(low);
  const highMidi = hzToMidi(high);
  const span = Math.max(1, highMidi - lowMidi);
  const center = Math.round((lowMidi + highMidi) / 2);

  if (difficulty === 'newbie') {
    if (roundIdx === 0) return midiToHz(center);
    if (roundIdx === 1) return midiToHz(clamp(center + randInt(-1, 1), lowMidi, highMidi));
    const minMidi = Math.round(lowMidi + span * 0.2);
    const maxMidi = Math.round(lowMidi + span * 0.75);
    return midiToHz(randInt(minMidi, Math.max(minMidi, maxMidi)));
  }

  const minMidi = Math.round(lowMidi + span * 0.1);
  const maxMidi = Math.round(lowMidi + span * 0.9);
  return midiToHz(randInt(minMidi, Math.max(minMidi, maxMidi)));
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MiniVocalGame({ user, onSubmitScore }: { user?: any; onSubmitScore?: (p: { score: number; accuracy: number }) => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('newbie');
  const [calibStep, setCalibStep] = useState<CalibStep>('low');
  const [calibView, setCalibView] = useState<CalibrationView>('intro');
  const [calibLeftMs, setCalibLeftMs] = useState(CALIBRATION_MS);
  const [range, setRange] = useState<VocalRange>({ low: null, high: null });
  const [micReady, setMicReady] = useState(false);
  const [hasCalibration, setHasCalibration] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('mv_onboard_v21') !== '1'; } catch { return true; }
  });
  const [calibrationError, setCalibrationError] = useState<string>('');
  const [calibrationNotice, setCalibrationNotice] = useState<string>('');

  const [pitch, setPitch] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [volume, setVolume] = useState(0);
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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pitchEngineRef = useRef<PitchEngine | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const referenceToneRef = useRef<ReferenceToneHandle | null>(null);
  const audioBufferRef = useRef<Parameters<AnalyserNode['getFloatTimeDomainData']>[0] | null>(null);

  const hzRingRef = useRef<Float64Array | null>(null);
  const hzRingTmpRef = useRef<Float64Array | null>(null);
  const hzRingIdxRef = useRef(0);
  const hzRingCountRef = useRef(0);
  const emaHzRef = useRef<number | null>(null);

  const calibCollectedRef = useRef<number[]>([]);
  const calibStartRef = useRef<number>(0);
  const holdStartRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const centsSamplesRef = useRef<number[]>([]);
  const totalSilentMsRef = useRef<number>(0);
  const pauseAccumulatedMsRef = useRef<number>(0);
  const pauseSinceRef = useRef<number>(0);

  const tracePointsRef = useRef<PitchPoint[]>([]);
  const [pitchRoadPoints, setPitchRoadPoints] = useState<PitchPoint[]>([]);

  const stageRef = useRef(stage);
  const holdingRef = useRef(holding);
  const autoPausedRef = useRef(autoPaused);
  const targetFreqRef = useRef(targetFreq);
  const difficultyRef = useRef(difficulty);
  const rangeRef = useRef(range);
  const uiStateTickRef = useRef(0);
  const uiTraceTickRef = useRef(0);
  const calibViewRef = useRef<CalibrationView>(calibView);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { holdingRef.current = holding; }, [holding]);
  useEffect(() => { autoPausedRef.current = autoPaused; }, [autoPaused]);
  useEffect(() => { targetFreqRef.current = targetFreq; }, [targetFreq]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { rangeRef.current = range; }, [range]);
  useEffect(() => { calibViewRef.current = calibView; }, [calibView]);

  const liveCents = useMemo(() => (pitch > 0 && targetFreq > 0 ? hzToCentsDiff(pitch, targetFreq) : 0), [pitch, targetFreq]);
  const liveStars = useMemo(() => {
    if (pitch <= 0 || confidence < 0.6) return 0;
    return starsFromAbsCents(Math.abs(liveCents || 0));
  }, [pitch, confidence, liveCents]);

  useEffect(() => {
    return () => {
      try { referenceToneRef.current?.stop(); } catch {}
    };
  }, []);

  useEffect(() => {
    const h = localStorage.getItem(HISTORY_KEY);
    const s = localStorage.getItem(STREAK_KEY);
    const b = localStorage.getItem(BOARD_KEY);
    if (h) setHistory(JSON.parse(h));
    if (s) setStreak(JSON.parse(s).count ?? 0);
    if (b) setLeaderboard(JSON.parse(b));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const stopReferenceTone = () => {
    try { referenceToneRef.current?.stop(); } catch {}
    referenceToneRef.current = null;
  };

  const pushTracePoint = (hz: number, prob: number, rms: number) => {
    if (stageRef.current !== 'game' || autoPausedRef.current || hz <= 0 || prob < 0.45 || rms < 0.008) return;
    const nowTs = Date.now();
    const centsRaw = hzToCentsDiff(hz, targetFreqRef.current);
    const cents = clamp(centsRaw, -60, 60);
    tracePointsRef.current.push({ t: nowTs, cents, grade: gradeFromAbsCents(Math.abs(centsRaw)) });
    const cutoff = nowTs - 8000;
    while (tracePointsRef.current.length > 0 && tracePointsRef.current[0].t < cutoff) {
      tracePointsRef.current.shift();
    }
  };

  const connectMic = async () => {
    if (micReady && analyserRef.current && audioCtxRef.current) {
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
      return;
    }
    const stream = await getMicStream();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = audioCtxRef.current ?? new AudioCtx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    if (!analyserRef.current) {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;
      audioCtxRef.current = audioCtx;
    }

    const tick = () => {
      const analyser = analyserRef.current;
      const ctx = audioCtxRef.current;
      if (!analyser || !ctx) return;

      if (!audioBufferRef.current || audioBufferRef.current.length !== analyser.fftSize) {
        audioBufferRef.current = new Float32Array(analyser.fftSize) as Parameters<AnalyserNode['getFloatTimeDomainData']>[0];
      }
      if (!pitchEngineRef.current || pitchEngineRef.current.bufferSize !== analyser.fftSize) {
        pitchEngineRef.current = new PitchEngine({
          sampleRate: ctx.sampleRate,
          bufferSize: analyser.fftSize,
          minHz: 80,
          maxHz: 1000,
          threshold: 0.15,
          minProbability: 0.7,
          emaAlpha: 0.2,
        });
      }

      analyser.getFloatTimeDomainData(audioBufferRef.current);
      const res = pitchEngineRef.current.process(audioBufferRef.current);
      const rms = res?.rms ?? 0;
      const prob = res?.probability ?? 0;
      const voiced = !!res && prob >= 0.6 && rms >= 0.012;
      let hz = voiced ? res!.hz : 0;

      if (hz > 0) {
        if (!hzRingRef.current) hzRingRef.current = new Float64Array(5);
        if (!hzRingTmpRef.current) hzRingTmpRef.current = new Float64Array(5);
        const ring = hzRingRef.current;
        const tmp = hzRingTmpRef.current;
        ring[hzRingIdxRef.current] = hz;
        hzRingIdxRef.current = (hzRingIdxRef.current + 1) % ring.length;
        hzRingCountRef.current = Math.min(ring.length, hzRingCountRef.current + 1);
        const n = hzRingCountRef.current;
        for (let i = 0; i < n; i++) tmp[i] = ring[i];
        for (let i = 1; i < n; i++) {
          const key = tmp[i];
          let j = i - 1;
          while (j >= 0 && tmp[j] > key) {
            tmp[j + 1] = tmp[j];
            j -= 1;
          }
          tmp[j + 1] = key;
        }
        const medianHz = tmp[Math.floor((n - 1) / 2)];
        const prev = emaHzRef.current;
        hz = prev == null ? medianHz : prev + 0.2 * (medianHz - prev);
        emaHzRef.current = hz;
      } else {
        hzRingIdxRef.current = 0;
        hzRingCountRef.current = 0;
        emaHzRef.current = null;
        pitchEngineRef.current.resetSmoothing();
      }

      pushTracePoint(hz, prob, rms);

      const now = performance.now();
      if (now - uiStateTickRef.current > 80) {
        uiStateTickRef.current = now;
        setPitch(hz);
        setConfidence(prob);
        setVolume(rms);
      }

      if (stageRef.current === 'calibration' && calibViewRef.current === 'capture' && hz > 0) {
        calibCollectedRef.current.push(hz);
      }

      if (stageRef.current === 'game' && holdingRef.current && !autoPausedRef.current) {
        const silent = rms < 0.012 || hz <= 0;
        if (silent) {
          if (!silenceStartRef.current) silenceStartRef.current = now;
          if (now - silenceStartRef.current > SILENCE_AUTOPAUSE_MS) {
            totalSilentMsRef.current += now - silenceStartRef.current;
            pauseSinceRef.current = now;
            setAutoPaused(true);
            setPauseMsg('Автопауза: звук пропал. Нажмите «Продолжить».');
          }
        } else {
          silenceStartRef.current = 0;
          centsSamplesRef.current.push(hzToCentsDiff(hz, targetFreqRef.current));
        }

        const centsErr = Math.abs(hzToCentsDiff(hz || targetFreqRef.current, targetFreqRef.current));
        const accuracyPct = clamp(100 - centsErr * 2, 0, 100);
        const elapsedHold = now - holdStartRef.current - pauseAccumulatedMsRef.current;
        const progress = clamp(elapsedHold / ROUND_MS, 0, 1);

        if (now - uiTraceTickRef.current > 100) {
          uiTraceTickRef.current = now;
          setLiveAccuracy(Math.round(accuracyPct));
          setHoldProgress(progress);
          setPitchRoadPoints([...tracePointsRef.current]);
        }

        if (elapsedHold >= ROUND_MS) finishRound();
      } else if (stageRef.current === 'game' && now - uiTraceTickRef.current > 120) {
        uiTraceTickRef.current = now;
        setPitchRoadPoints([...tracePointsRef.current]);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    if (!rafRef.current) tick();
    setMicReady(true);
  };

  const startSetupFlow = async () => {
    try {
      await connectMic();
      setCalibrationError('');
      setStage('difficulty');
    } catch {
      setCalibrationError('Не удалось подключить микрофон. Проверьте разрешения браузера.');
    }
  };

  const beginCalibrationFlow = () => {
    setStage('calibration');
    setCalibStep('low');
    setCalibView('intro');
    setCalibrationNotice('');
    setCalibrationError('');
  };

  const startCalibrationCapture = () => {
    setCalibView('capture');
    calibCollectedRef.current = [];
    calibStartRef.current = performance.now();
    setCalibLeftMs(CALIBRATION_MS);
    setCalibrationNotice('');
  };

  useEffect(() => {
    if (stage !== 'calibration' || calibView !== 'capture') return;
    let timer = 0;
    const loop = () => {
      const elapsed = performance.now() - calibStartRef.current;
      const left = clamp(CALIBRATION_MS - elapsed, 0, CALIBRATION_MS);
      setCalibLeftMs(left);
      if (left <= 0) {
        const samples = calibCollectedRef.current.filter((f: number) => f > 0).sort((a: number, b: number) => a - b);
        if (samples.length < 6) {
          setCalibView('intro');
          setCalibrationError('Калибровка не удалась. Пойте громче и ровнее.');
          return;
        }
        const median = samples[Math.floor(samples.length / 2)];
        if (calibStep === 'low') {
          setRange((prev: VocalRange) => ({ ...prev, low: median }));
          setCalibStep('high');
          setCalibView('intro');
          setCalibrationNotice(`Низкая нота сохранена: ${freqToNote(median)} · ${Math.round(median)} Hz`);
          setCalibrationError('');
        } else {
          const nextRange = { low: rangeRef.current.low, high: median };
          if (!isRangeValid(nextRange)) {
            setRange({ low: null, high: null });
            setHasCalibration(false);
            setCalibStep('low');
            setCalibView('intro');
            setCalibrationError('Диапазон распознан неверно. Повторите калибровку громче и устойчивее.');
            return;
          }
          setRange(nextRange);
          setHasCalibration(true);
          setCalibrationError('');
          setCalibrationNotice(`Высокая нота сохранена: ${freqToNote(median)} · ${Math.round(median)} Hz`);
          window.setTimeout(() => {
            setStage('game');
            prepareRound(0);
          }, 700);
        }
        return;
      }
      timer = window.setTimeout(loop, 60);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [stage, calibView, calibStep]);

  const prepareRound = (idx: number) => {
    stopReferenceTone();
    setRoundIndex(idx);
    setTargetFreq(pickTargetFrequency(rangeRef.current, difficultyRef.current, idx));
    setHolding(false);
    holdingRef.current = false;
    setAutoPaused(false);
    autoPausedRef.current = false;
    pauseAccumulatedMsRef.current = 0;
    pauseSinceRef.current = 0;
    setPauseMsg('');
    tracePointsRef.current = [];
    setPitchRoadPoints([]);
    setLastRoundScore(null);
    setLiveAccuracy(0);
    setHoldProgress(0);
  };

  const startGameAfterDifficulty = () => {
    if (!hasCalibration) {
      beginCalibrationFlow();
      return;
    }
    setStage('game');
    prepareRound(0);
  };

  const startHold = () => {
    if (autoPausedRef.current) return;
    setLastRoundScore(null);
    setLiveAccuracy(0);
    setHoldProgress(0);
    setHolding(true);
    holdingRef.current = true;
    holdStartRef.current = performance.now();
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
    pauseAccumulatedMsRef.current = 0;
    pauseSinceRef.current = 0;
    tracePointsRef.current = [];
    setPitchRoadPoints([]);
  };

  const stopHold = () => {
    setHolding(false);
    holdingRef.current = false;
  };

  const resumeAfterPause = () => {
    if (pauseSinceRef.current) {
      pauseAccumulatedMsRef.current += performance.now() - pauseSinceRef.current;
      pauseSinceRef.current = 0;
    }
    silenceStartRef.current = 0;
    setAutoPaused(false);
    autoPausedRef.current = false;
  };

  const finishRound = () => {
    setHolding(false);
    holdingRef.current = false;
    const samples = centsSamplesRef.current;
    const avgAbsCents = samples.length ? samples.reduce((a: number, b: number) => a + Math.abs(b), 0) / samples.length : 1200;
    const meanSigned = samples.length ? samples.reduce((a: number, b: number) => a + b, 0) / samples.length : 0;
    const stdev = samples.length ? Math.sqrt(samples.reduce((acc: number, c: number) => acc + (c - meanSigned) ** 2, 0) / samples.length) : 200;

    const tolerance = difficultyRef.current === 'newbie' ? 70 : 35;
    const stabilityWeight = difficultyRef.current === 'newbie' ? 0.08 : 0.16;
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

    setResults((prev: RoundResult[]) => {
      const next = [...prev, one];
      if (next.length >= TOTAL_ROUNDS) {
        finishGame(next);
      } else {
        window.setTimeout(() => prepareRound(next.length), 550);
      }
      return next;
    });
  };

  const finishGame = (finalRounds: RoundResult[]) => {
    const finalScore = finalRounds.reduce((a: number, r: RoundResult) => a + r.score, 0) / finalRounds.length;
    const level = levelFromScore(finalScore);
    const record: HistoryRecord = { date: new Date().toISOString(), score: Math.round(finalScore), level };
    const nextHistory = [record, ...history].slice(0, 5);
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

    const now = todayISO();
    const streakState = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0}');
    const prevDate = typeof streakState.date === 'string' ? streakState.date : '';
    const diffDays = prevDate ? Math.floor((+new Date(now) - +new Date(prevDate)) / 86400000) : 0;
    const count = !prevDate ? 1 : diffDays <= 0 ? streakState.count : diffDays === 1 ? streakState.count + 1 : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ count, date: now }));
    setStreak(count);

    const weekTag = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}`;
    const boardRaw = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') as Array<LeaderRecord & { week: string }>;
    const board = [...boardRaw, { id: `anon-${Math.random().toString(36).slice(2, 7)}`, score: Math.round(finalScore), week: weekTag }]
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

  const submittedRef = useRef(false);
  useEffect(() => {
    if (stage !== 'results' || !onSubmitScore || submittedRef.current) return;
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
  const offer = level === 'Новичок'
    ? 'Оффер: диагностика + базовый план за 20 минут.'
    : level === 'Средний'
      ? 'Оффер: персональный апгрейд диапазона и стабильности.'
      : 'Оффер: прокачка артистизма + запись демо-куплета.';

  const playReferenceTone = async () => {
    try {
      if (!audioCtxRef.current) await connectMic();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();
      stopReferenceTone();
      referenceToneRef.current = startReferenceTone(ctx, targetFreqRef.current, 60_000, 0.1);
    } catch {}
  };

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
    await navigator.clipboard.writeText(`${text} ${utmUrl}`);
    alert('Текст результата скопирован в буфер обмена.');
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
    await navigator.clipboard.writeText(`Сторис текст: Мой результат ${finalScore} (${level}). Link: ${utmUrl}`);
    alert('PNG скачан. Текст скопирован в буфер. Опубликуйте в IG Stories вручную.');
  };

  const resetAll = () => {
    stopReferenceTone();
    setStage('setup');
    setCalibStep('low');
    setCalibView('intro');
    setCalibLeftMs(CALIBRATION_MS);
    setRange({ low: null, high: null });
    setHasCalibration(false);
    setCalibrationError('');
    setCalibrationNotice('');
    setRoundIndex(0);
    setResults([]);
    setHolding(false);
    holdingRef.current = false;
    setAutoPaused(false);
    autoPausedRef.current = false;
    setPauseMsg('');
    setPitchRoadPoints([]);
    tracePointsRef.current = [];
    submittedRef.current = false;
  };

  const starSlots = new Array(5).fill(0);
  const calibrationTitle = calibStep === 'low' ? 'Калибровка 1 / 2' : 'Калибровка 2 / 2';
  const calibrationText = calibStep === 'low'
    ? 'Спойте самую низкую комфортную ноту. Не давите голос, держите звук ровно.'
    : 'Теперь спойте самую высокую комфортную ноту. Тоже без напряжения и фальцета.';

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
                <li>Включите микрофон и пройдите калибровку.</li>
                <li>Нажмите и удерживайте <b>«Удерживать ноту»</b>.</li>
                <li>Пойте ноту <b>{freqToNote(targetFreq)}</b> около <b>{Math.round(ROUND_MS / 1000)} сек</b>.</li>
              </ol>
              <div className="onboardActions">
                <button className="primary" onClick={() => {
                  try { localStorage.setItem('mv_onboard_v21', '1'); } catch {}
                  setShowOnboarding(false);
                }}>Понятно</button>
              </div>
            </div>
          </div>
        ) : null}

        {stage === 'setup' && (
          <section className="homeGameSetup stageCenter">
            <div className="homeGameTitle">🎤 MiniVocalGame</div>
            <div className="homeGameSubtitle">Пой в ноту. Получай ⭐. Делись результатом.</div>
            <div className="homeGameHint">Сначала подключим микрофон, затем отдельно выберем сложность и пройдём калибровку.</div>
            <div className="homeGamePrimary">
              <button className="homeGameMicBtn" type="button" onClick={startSetupFlow}>
                <span className="homeGameMicIcon">🎙️</span>
                <span className="homeGameMicText">{micReady ? 'Продолжить' : 'Включить микрофон'}</span>
              </button>
            </div>
            {calibrationError ? <div className="calibrationWarning">{calibrationError}</div> : null}
          </section>
        )}

        {stage === 'difficulty' && (
          <section className="v6Section stageCenter stageNarrow">
            <h2>Выбор сложности</h2>
            <p className="calibrationBody">Настройка вынесена на отдельный экран, чтобы старт был чище и понятнее.</p>
            <div className="difficultyCards">
              <button type="button" className={`difficultyCard ${difficulty === 'newbie' ? 'active' : ''}`} onClick={() => setDifficulty('newbie')}>
                <strong>Новичок</strong>
                <span>Мягче цели, комфортная середина диапазона.</span>
              </button>
              <button type="button" className={`difficultyCard ${difficulty === 'pro' ? 'active' : ''}`} onClick={() => setDifficulty('pro')}>
                <strong>Профи</strong>
                <span>Более широкий диапазон и жёстче оценка.</span>
              </button>
            </div>
            <div className="difficultyActions">
              <button type="button" className="btn subtle" onClick={() => setStage('setup')}>Назад</button>
              <button type="button" className="homeGameMicBtn compact" onClick={startGameAfterDifficulty}>Дальше</button>
            </div>
          </section>
        )}

        {stage === 'calibration' && (
          <section className="v6Section stageCenter stageNarrow calibrationScreen">
            <div className="calibrationStepPill">{calibrationTitle}</div>
            <h2>{calibStep === 'low' ? 'Низкая нота' : 'Высокая нота'}</h2>
            <p className="calibrationBody">{calibrationText}</p>
            {calibrationNotice ? <div className="calibrationNotice">{calibrationNotice}</div> : null}
            {calibrationError ? <div className="calibrationWarning">{calibrationError}</div> : null}
            {calibView === 'intro' ? (
              <>
                <div className="calibrationChecklist">
                  <div>1. Сядьте ровно и держите телефон/ноутбук неподвижно.</div>
                  <div>2. Пойте одну устойчивую ноту, не скользите вверх-вниз.</div>
                  <div>3. Держите звук примерно 4 секунды после старта.</div>
                </div>
                <div className="difficultyActions">
                  <button type="button" className="btn subtle" onClick={() => setStage('difficulty')}>Назад</button>
                  <button type="button" className="homeGameMicBtn compact" onClick={startCalibrationCapture}>Начать шаг</button>
                </div>
              </>
            ) : (
              <>
                <div className="calibrationTimer">Осталось: {(calibLeftMs / 1000).toFixed(1)} c</div>
                <div className="calibrationLiveGrid">
                  <div className="metricCell metricCell--centered">
                    <span className="metricLabel">Нота</span>
                    <span className="metricValue">{freqToNote(pitch)}</span>
                  </div>
                  <div className="metricCell metricCell--centered">
                    <span className="metricLabel">Частота</span>
                    <span className="metricValue">{Math.round(pitch) || 0} Hz</span>
                  </div>
                  <div className="metricCell metricCell--centered">
                    <span className="metricLabel">Громкость</span>
                    <span className="metricValue">{volumeHint}</span>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {stage === 'game' && (
          <section className="v6Section gameSection">
            <h2>Раунд {roundIndex + 1} / {TOTAL_ROUNDS}</h2>
            <div className="v7GameGrid">
              <div className="v7Ring">
                <PitchRingSmule cents={liveCents} note={freqToNote(pitch)} hz={pitch} confidence={confidence} />
              </div>

              <div className="v7Hud">
                <div className="hudGrid hudGridMain">
                  <div className="badge metricCell metricCell--live">
                    <span className="metricLabel">{t('hud.live')}</span>
                    <strong className="metricValue">{Math.round(pitch) || 0} Hz</strong>
                  </div>
                  <div className="badge metricCell metricCell--target">
                    <span className="metricLabel">{t('hud.target')}</span>
                    <strong className="metricValue">{freqToNote(targetFreq)}</strong>
                  </div>
                  <button
                    className="badge btn metricCell metricCell--tone"
                    title={t('hud.playTone')}
                    onMouseDown={playReferenceTone}
                    onMouseUp={stopReferenceTone}
                    onMouseLeave={stopReferenceTone}
                    onTouchStart={(e) => { e.preventDefault(); playReferenceTone(); }}
                    onTouchEnd={stopReferenceTone}
                    onTouchCancel={stopReferenceTone}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playReferenceTone(); }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stopReferenceTone(); }
                    }}
                  >
                    <span className="metricLabel">Тон</span>
                    <strong className="metricValue">🔊 {t('hud.playTone')}</strong>
                  </button>
                  <div className="badge metricCell metricCell--stars">
                    <span className="metricLabel">Звёзды</span>
                    <strong className="metricValue metricStars">
                      {starSlots.map((_, i) => <span key={i}>{i < liveStars ? '★' : '☆'}</span>)}
                    </strong>
                  </div>
                </div>

                {holding ? (
                  <div>
                    <ScoreMeter value={liveAccuracy} max={100} label={t('hud.accuracy')} />
                    <div className="holdProgress"><div className="holdProgressBar" style={{ width: `${Math.round(holdProgress * 100)}%` }} /></div>
                    <div className="hint subtle">{t('hud.holdHint')} <strong>{Math.max(0, Math.ceil((ROUND_MS - (performance.now() - holdStartRef.current - pauseAccumulatedMsRef.current)) / 1000))}</strong>s</div>
                  </div>
                ) : (
                  <div className="hint">{t('hud.holdToScore')}{lastRoundScore !== null ? <div className="hintScore">{t('hud.roundScore')}: <strong>{lastRoundScore}</strong></div> : null}</div>
                )}

                <div className="hudGrid hudGridStats">
                  <div className="badge subtle metricCell metricCell--streak">
                    <span className="metricLabel">{t('hud.streak')}</span>
                    <strong className="metricValue">{streak}</strong>
                  </div>
                  <div className="badge subtle metricCell metricCell--confidence">
                    <span className="metricLabel">{t('hud.confidence')}</span>
                    <strong className="metricValue">{Math.round(confidence * 100)}%</strong>
                  </div>
                </div>
              </div>
            </div>

            <PitchRoad points={pitchRoadPoints} />
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
          <section className="v6Section resultsSection">
            <h2>Результаты</h2>
            <div className="resultsSummary">
              <p>Итоговый счёт: <strong>{finalScore}</strong></p>
              <p>Награда: <strong>{'⭐'.repeat(starsFromScore(finalScore))}</strong></p>
              <p>Уровень: <strong>{level}</strong></p>
            </div>
            <p>{offer}</p>
            <p>🎁 Приз: напишите «ХОЧУ ПРИЗ» в DM и получите бонус-упражнение.</p>
            <p>Авто-DM сценарий: «Привет! Прошёл челлендж, хочу разбор голоса и план занятий».</p>

            <div className="resultsControls">
              <label className="resultsField">
                <span>Стиль карточки</span>
                <select value={cardStyle} onChange={(e) => setCardStyle(e.target.value as CardStyle)}>
                  <option value="minimal">Минимал</option>
                  <option value="neon">Неон</option>
                  <option value="karaoke">Караоке</option>
                </select>
              </label>
              <label className="resultsField">
                <span>UTM шаблон</span>
                <select value={template} onChange={(e) => setTemplate(e.target.value as 'template_a' | 'template_b')}>
                  <option value="template_a">Шаблон A</option>
                  <option value="template_b">Шаблон B</option>
                </select>
              </label>
            </div>

            <div className="resultsLinkBlock">
              <div className="resultsLinkLabel">Ссылка для стикера</div>
              <a className="resultsLink" href={utmUrl} target="_blank" rel="noreferrer">{utmUrl}</a>
            </div>
            <div className="shareRow resultsActions">
              <button onClick={shareToStories}>Поделиться в Stories</button>
              <button onClick={shareResultText}>Поделиться текстом</button>
              <a className="dm" href={`https://ig.me/m/vocal.jivoizvuk.ekb?text=${dmText}`} target="_blank" rel="noreferrer">Открыть DM с текстом</a>
            </div>

            <h3>Последние игры</h3>
            <ul>{history.map((h) => <li key={h.date}>{new Date(h.date).toLocaleString()} — {h.score} ({h.level})</li>)}</ul>
            <p>Ежедневная серия: {streak} 🔥</p>
            <h3>Недельный рейтинг (локальный топ‑5)</h3>
            <ol>{leaderboard.map((x) => <li key={x.id}>{x.id}: {x.score}</li>)}</ol>
            <button className="resultsResetBtn" onClick={resetAll}>Полный перезапуск челленджа</button>
          </section>
        )}
      </div>
    </div>
  );
}
