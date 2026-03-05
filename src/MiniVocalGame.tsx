import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AccuracyRing } from './components/AccuracyRing';
import { PitchRingSmule } from './components/PitchRingSmule';
import { PitchTimeline, type TimelinePoint } from './components/PitchTimeline';
import { ScoreMeter } from './components/ScoreMeter';
import { useI18n } from './i18n';

const TOTAL_ROUNDS = 5;
const CALIBRATION_MS = 6000;
const ROUND_MS = 5000;
const SILENCE_AUTOPAUSE_MS = 1000;
const HISTORY_KEY = 'mini-vocal-history';
const STREAK_KEY = 'mini-vocal-streak';
const BOARD_KEY = 'mini-vocal-weekly-board';

type Stage = 'setup' | 'calibration' | 'game' | 'results';
type Difficulty = 'newbie' | 'pro';
type CalibStep = 'low' | 'high' | 'done';
type CardStyle = 'minimal' | 'neon' | 'karaoke';

type GameMode = 'classic' | 'daily';

const DAILY_NOTES = ['C4','D4','E4','F4','G4','A4','B4'];


type RoundResult = {
  targetFreq: number;
  avgCentsError: number;
  instabilityPenalty: number;
  silencePenalty: number;
  score: number;
  grade: 'perfect' | 'great' | 'good' | 'bad';
  comboBonus: number;
  combo: number;
};

type HistoryRecord = {
  date: string;
  score: number;
  level: string;
};

type LeaderRecord = {
  id: string;
  score: number;
  grade: 'perfect' | 'great' | 'good' | 'bad';
  comboBonus: number;
  combo: number;
};

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const gradeFromScore = (score: number): LeaderRecord['grade'] => {
  if (score >= 95) return 'perfect';
  if (score >= 85) return 'great';
  if (score >= 70) return 'good';
  return 'bad';
};


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

function hzToCentsDiff(freq: number, target: number): number {
  if (freq <= 0 || target <= 0) return 1200;
  return 1200 * Math.log2(freq / target);
}

function rmsFromBuffer(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

type YinResult = { hz: number; probability: number } | null;

/**
 * YIN pitch detection (time-domain). Better for vocal fundamental than FFT peak picking.
 * Returns null when pitch is not confident.
 */
function yinPitch(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 80,
  maxHz = 1000,
  threshold = 0.15
): YinResult {
  const SIZE = buffer.length;
  const minTau = Math.floor(sampleRate / maxHz);
  const maxTau = Math.floor(sampleRate / minHz);
  if (minTau < 2 || maxTau <= minTau + 2) return null;

  const diff = new Float32Array(maxTau + 1);
  const cmndf = new Float32Array(maxTau + 1);

  for (let tau = 1; tau <= maxTau; tau += 1) {
    let sum = 0;
    for (let i = 0; i < SIZE - tau; i += 1) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau += 1) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] * (tau / (runningSum || 1e-12));
  }

  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau += 1) {
    if (cmndf[tau] < threshold) {
      while (tau + 1 <= maxTau && cmndf[tau + 1] < cmndf[tau]) tau += 1;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return null;

  // Parabolic interpolation for better accuracy
  const x0 = tauEstimate - 1 >= 1 ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 <= maxTau ? tauEstimate + 1 : tauEstimate;
  const s0 = cmndf[x0];
  const s1 = cmndf[tauEstimate];
  const s2 = cmndf[x2];
  const denom = 2 * s1 - s2 - s0;

  let betterTau = tauEstimate;
  if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / (2 * denom);

  const hz = sampleRate / betterTau;
        const p = hz; // alias used by calibration/game logic
  const probability = clamp(1 - cmndf[tauEstimate], 0, 1);

  if (!Number.isFinite(hz) || hz <= 0) return null;
  return { hz, probability };
}

function ema(prev: number | null, next: number, alpha = 0.25): number {
  if (prev == null) return next;
  return prev + alpha * (next - prev);
}

function stabilizeHz(prevHz: number | null, nextHz: number, maxJumpCents = 80): number {
  if (prevHz == null) return nextHz;
  const cents = 1200 * Math.log2(nextHz / prevHz);
  if (Math.abs(cents) > maxJumpCents) return prevHz;
  return nextHz;
}


function levelFromScore(score: number): string {
  if (score >= 85) return 'Профи';
  if (score >= 60) return 'Средний';
  return 'Новичок';
}


function scoreToStars(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  return 1;
}
const freqToMidi = (freq: number) => 12 * Math.log2(freq / 440) + 69;
const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const freqToNoteName = (freq: number) => {
  const midi = Math.round(freqToMidi(freq));
  const name = NOTE_NAMES[(midi % 12 + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
};

const noteNameToFreq = (note: string) => {
  const m = /^([A-G])(#?)(\d)$/.exec(note);
  if (!m) return 440;
  const base = m[1];
  const sharp = m[2] === '#';
  const octave = Number(m[3]);
  const name = base + (sharp ? '#' : '');
  const idx = NOTE_NAMES.indexOf(name as any);
  const midi = (octave + 1) * 12 + idx;
  return midiToFreq(midi);
};

const dailyNoteForDate = (isoDate: string) => {
  // deterministic "daily challenge" note
  let hash = 0;
  for (let i = 0; i < isoDate.length; i++) hash = (hash * 31 + isoDate.charCodeAt(i)) >>> 0;
  return DAILY_NOTES[hash % DAILY_NOTES.length];
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MiniVocalGame({ user, onSubmitScore }: { user?: any; onSubmitScore?: (p: { score: number; accuracy: number }) => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('newbie');
  const [mode, setMode] = useState<GameMode>('classic');
  const [dailyNote, setDailyNote] = useState<string>(() => dailyNoteForDate(todayISO()));
  const [calibStep, setCalibStep] = useState<CalibStep>('low');
  const [calibLeftMs, setCalibLeftMs] = useState(CALIBRATION_MS);
  const [range, setRange] = useState<{ low: number; high: number }>({ low: 165, high: 440 });
  const [micReady, setMicReady] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [volume, setVolume] = useState(0);
  const [timelinePoints, setTimelinePoints] = useState<TimelinePoint[]>([]);
  const timelineRef = useRef<TimelinePoint[]>([]);
  const lastTimelineTickRef = useRef(0);

  const [roundIndex, setRoundIndex] = useState(0);
  const [targetFreq, setTargetFreq] = useState(220);
  const liveCents = useMemo(() => (pitch > 0 && targetFreq > 0 ? hzToCentsDiff(pitch, targetFreq) : 0), [pitch, targetFreq]);
  const [holding, setHolding] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [pauseMsg, setPauseMsg] = useState('');
  const [results, setResults] = useState<RoundResult[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [streak, setStreak] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderRecord[]>([]);
  const [cardStyle, setCardStyle] = useState<CardStyle>('minimal');
  const [template, setTemplate] = useState<'template_a' | 'template_b'>('template_a');
  const [liveScore, setLiveScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [perfectStreak, setPerfectStreak] = useState(0);

  const liveScoreRef = useRef(0);
  const comboRef = useRef(0);
  const perfectStreakRef = useRef(0);

  const lastScoreTickRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothHzRef = useRef<number | null>(null);

  const calibCollectedRef = useRef<number[]>([]);
  const calibStartRef = useRef<number>(0);

  const holdStartRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const centsSamplesRef = useRef<number[]>([]);
  const totalSilentMsRef = useRef<number>(0);

  useEffect(() => {
    const h = localStorage.getItem(HISTORY_KEY);
    const s = localStorage.getItem(STREAK_KEY);
    const b = localStorage.getItem(BOARD_KEY);
    if (h) setHistory(JSON.parse(h));
    if (s) setStreak(JSON.parse(s).count ?? 0);
    if (b) setLeaderboard(JSON.parse(b));
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  const connectMic = async () => {
    const stream = await getMicStream();
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    streamRef.current = stream;
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    const tick = () => {
      if (!analyserRef.current || !audioCtxRef.current) return;
      if (!audioBufferRef.current || audioBufferRef.current.length !== analyserRef.current.fftSize) {
        audioBufferRef.current = new Float32Array(analyserRef.current.fftSize) as unknown as Float32Array<ArrayBuffer>;
      }
      const buffer = audioBufferRef.current;
      analyserRef.current.getFloatTimeDomainData(buffer);
      const rms = rmsFromBuffer(buffer);
        const p = pitch;
      const yin = rms >= 0.01 ? yinPitch(buffer, audioCtxRef.current.sampleRate) : null;
      setConfidence(yin ? yin.probability : 0);

      let hz = 0;
      if (yin && yin.probability >= 0.8) {
        hz = stabilizeHz(smoothHzRef.current, yin.hz, 90);
        hz = ema(smoothHzRef.current, hz, 0.25);
        smoothHzRef.current = hz;
      } else {
        smoothHzRef.current = null;
      }

      setPitch(hz);
      setVolume(rms);

      if (stage === 'calibration') {
        if (p > 0) calibCollectedRef.current.push(p);
      }

      if (stage === 'game' && holding && !autoPaused) {
        const now = performance.now();
        const silent = rms < 0.012 || p <= 0;
        if (silent) {
          if (!silenceStartRef.current) silenceStartRef.current = now;
          if (now - silenceStartRef.current > SILENCE_AUTOPAUSE_MS) {
            totalSilentMsRef.current += now - silenceStartRef.current;
            setAutoPaused(true);
            setPauseMsg('Автопауза: звук пропал более 1 секунды. Нажмите «Продолжить».');
          }
        } else {
          silenceStartRef.current = 0;
          centsSamplesRef.current.push(hzToCentsDiff(p, targetFreq));
        // V12: pitch timeline (throttled)
        const cents = hzToCentsDiff(p, targetFreq);
        const tms = now;
        timelineRef.current.push({ t: tms, cents, confidence: yin ? yin.probability : 0 });
        // keep last ~6s
        const cutoff = tms - 6000;
        while (timelineRef.current.length && timelineRef.current[0].t < cutoff) timelineRef.current.shift();
        const lastTL = lastTimelineTickRef.current || 0;
        if (tms - lastTL > 120) {
          lastTimelineTickRef.current = tms;
          setTimelinePoints([...timelineRef.current]);
        }

        // PRO: live score & ring accuracy (update ~10fps)
        const centsErr = Math.abs(hzToCentsDiff(p, targetFreq));
        const accuracy = clamp(1 - centsErr / 100, 0, 1);
        liveScoreRef.current += accuracy * 0.8; // tune gain
        const last = lastScoreTickRef.current || 0;
        if (now - last > 100) {
          lastScoreTickRef.current = now;
          setLiveScore(Math.round(liveScoreRef.current));
        }

        }

        if (now - holdStartRef.current >= ROUND_MS) {
          finishRound();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
    setMicReady(true);
  };

  const beginCalibration = () => {
    setStage('calibration');
    setCalibStep('low');
    setCalibLeftMs(CALIBRATION_MS);
    calibCollectedRef.current = [];
    calibStartRef.current = performance.now();
  };

  useEffect(() => {
    if (stage !== 'calibration' || calibStep === 'done') return;
    let timer: number;
    const loop = () => {
      const elapsed = performance.now() - calibStartRef.current;
      const left = clamp(CALIBRATION_MS - elapsed, 0, CALIBRATION_MS);
      setCalibLeftMs(left);
      if (left <= 0) {
        const samples = calibCollectedRef.current.filter((f) => f > 0);
        if (samples.length > 5) {
          const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
          setRange((prev) =>
            calibStep === 'low' ? { ...prev, low: median } : { ...prev, high: Math.max(median, prev.low + 40) }
          );
        }
        calibCollectedRef.current = [];
        if (calibStep === 'low') {
          setCalibStep('high');
          calibStartRef.current = performance.now();
          setCalibLeftMs(CALIBRATION_MS);
        } else {
          setCalibStep('done');
          setStage('game');
          prepareRound(0);
        }
        return;
      }
      timer = window.setTimeout(loop, 80);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [stage, calibStep]);

  const prepareRound = (idx: number) => {
    setRoundIndex(idx);
    const lowMidi = Math.round(12 * Math.log2(range.low / 440) + 69);
    const highMidi = Math.round(12 * Math.log2(range.high / 440) + 69);
    const midi = Math.round(lowMidi + Math.random() * Math.max(1, highMidi - lowMidi));
    setTargetFreq(440 * Math.pow(2, (midi - 69) / 12));
    setHolding(false);
    setAutoPaused(false);
    setPauseMsg('');
  };

  const startHold = () => {
    liveScoreRef.current = 0;
    setLiveScore(0);
    lastScoreTickRef.current = 0;
    if (autoPaused) return;
    setHolding(true);
    holdStartRef.current = performance.now();
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
  };

  const finishRound = () => {
    setHolding(false);
    const samples = centsSamplesRef.current;
    const avgAbsCents = samples.length
      ? samples.reduce((a, b) => a + Math.abs(b), 0) / samples.length
      : 1200;
    const stdev = samples.length
      ? Math.sqrt(samples.reduce((acc, c) => acc + (c - avgAbsCents) ** 2, 0) / samples.length)
      : 200;

    const tolerance = difficulty === 'newbie' ? 70 : 35;
    const stabilityWeight = difficulty === 'newbie' ? 0.08 : 0.16;

    const baseAccuracy = clamp(100 - (avgAbsCents / tolerance) * 100, 0, 100);
    const instabilityPenalty = clamp(stdev * stabilityWeight, 0, 40);
    const silencePenalty = clamp((totalSilentMsRef.current / ROUND_MS) * 45, 0, 45);
    const score = clamp(baseAccuracy - instabilityPenalty - silencePenalty, 0, 100);

    const grade = avgAbsCents < 5 ? 'perfect' : avgAbsCents < 15 ? 'great' : avgAbsCents < 30 ? 'good' : 'bad';
    if (grade === 'perfect') {
      comboRef.current += 1;
      perfectStreakRef.current += 1;
    } else {
      comboRef.current = 0;
      perfectStreakRef.current = 0;
    }
    const comboBonus = Math.min(comboRef.current * 2, 12);
    setCombo(comboRef.current);
    setPerfectStreak(perfectStreakRef.current);

    const scoreWithCombo = clamp(score + comboBonus, 0, 100);


    const one: RoundResult = {
      targetFreq,
      avgCentsError: avgAbsCents,
      instabilityPenalty,
      silencePenalty,
      score: scoreWithCombo,
      grade,
      comboBonus,
      combo: comboRef.current
    };

    setResults((prev) => {
      const next = [...prev, one];
      if (mode === 'daily' ? next.length >= 1 : next.length >= TOTAL_ROUNDS) {
        finishGame(next);
      } else {
        window.setTimeout(() => prepareRound(next.length), 500);
      }
      return next;
    });
  };

  const finishGame = (finalRounds: RoundResult[]) => {
    const finalScore = finalRounds.reduce((a, r) => a + r.score, 0) / finalRounds.length;
    const level = levelFromScore(finalScore);
    const record: HistoryRecord = {
      date: new Date().toISOString(),
      score: Math.round(finalScore),
      level
    };
    const nextHistory = [record, ...history].slice(0, 5);
    setHistory(nextHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

    const now = todayISO();
    const streakState = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"count":0}');
    const prevDate = typeof streakState.date === 'string' ? streakState.date : '';
    const prev = prevDate ? new Date(prevDate) : null;
    
    const diffDays = prevDate ? Math.floor((+new Date(now) - +new Date(prevDate)) / 86400000) : 0;
    const count = !prevDate ? 1 : diffDays <= 0 ? streakState.count : diffDays === 1 ? streakState.count + 1 : 1;
    localStorage.setItem(STREAK_KEY, JSON.stringify({ count, date: now }));
    setStreak(count);

    const weekTag = `${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}`;
    // Back-compat: older localStorage entries may contain only {id, score, week}.
    const boardRaw = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') as Array<Partial<LeaderRecord> & { week?: string }>;
    const normalized = boardRaw.map((x) => ({
      id: String(x.id ?? `anon-${Math.random().toString(36).slice(2, 7)}`),
      score: Number(x.score ?? 0),
      grade: (x.grade ?? 'good') as LeaderRecord['grade'],
      comboBonus: Number(x.comboBonus ?? 0),
      combo: Number(x.combo ?? 0),
      week: String((x as any).week ?? weekTag)
    }));

    const scored = Math.round(finalScore);
    const entry = {
      id: `anon-${Math.random().toString(36).slice(2, 7)}`,
      score: scored,
      grade: gradeFromScore(scored),
      comboBonus: 0,
      combo: 0,
      week: weekTag
    };

    const board = [...normalized, entry]
      .filter((x) => x.week === weekTag)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
    setLeaderboard(board.map(({ id, score, grade, comboBonus, combo }) => ({ id, score, grade, comboBonus, combo })));

    setStage('results');
  };

  const finalScore = useMemo(() => {
    if (!results.length) return 0;
    return Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
  }, [results]);

  const finalAccuracy = useMemo(() => {
    if (!results.length) return 0;
    const meanErr = results.reduce((a, r) => a + Math.abs(r.avgCentsError), 0) / results.length;
    return Math.max(0, Math.min(1, 1 - meanErr / 50));
  }, [results]);

  const submittedRef = useRef(false);
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
      utm_content: template
    });
    return `https://www.instagram.com/vocal.jivoizvuk.ekb/?${params.toString()}`;
  }, [template]);

  const dmText = encodeURIComponent(
    `Привет! Я прошёл Mini Vocal Challenge, получил ${finalScore} (${level}). Хочу разбор и план роста 🎤`
  );
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
    setStage('setup');
    setCalibStep('low');
    setCalibLeftMs(CALIBRATION_MS);
    setRoundIndex(0);
    setResults([]);
    setHolding(false);
    setAutoPaused(false);
  };

  return (
    <div className="v5Shell v6Shell">
      <div className="v5Backdrop" aria-hidden />
      <div className="v5Card v6GameCard">
      <h1>MiniVocalGame — вокальный челлендж</h1>

      {stage === 'setup' && (
        <section className="v6Section">
          <h2>Настройка</h2>
          <label>
            Сложность:
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="newbie">Новичок</option>
              <option value="pro">Профи</option>
            </select>
          </label>
          <label style={{ marginTop: 10, display: 'block' }}>
            Режим:
            <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
              <option value="classic">Classic (5 раундов)</option>
              <option value="daily">Daily Note (1 раунд)</option>
            </select>
          </label>
          {mode === 'daily' && (
            <p style={{ marginTop: 8, opacity: 0.9 }}>
              Daily note: <b>{dailyNote}</b>
            </p>
          )}
          <button onClick={connectMic} disabled={micReady}>{micReady ? 'Микрофон подключён' : 'Подключить микрофон'}</button>
          <button onClick={beginCalibration} disabled={!micReady}>Начать калибровку</button>
        </section>
      )}

      {stage === 'calibration' && (
        <section className="v6Section">
          <h2>Калибровка диапазона</h2>
          <p>{calibStep === 'low' ? 'Спойте низкую комфортную ноту (6 сек)' : 'Спойте высокую комфортную ноту (6 сек)'}</p>
          <p>Осталось: {(calibLeftMs / 1000).toFixed(1)} c</p>
          <p>Текущая нота: {freqToNote(pitch)} ({Math.round(pitch)} Hz)</p>
          <p>{volumeHint}</p>
        </section>
      )}

      {stage === 'game' && (
        <section className="v6Section">
          <h2>Раунд {roundIndex + 1} / {TOTAL_ROUNDS}</h2>
          <div className="v7GameGrid">
            <div className="v7Ring">
              <PitchRingSmule cents={liveCents} note={freqToNote(pitch)} hz={pitch} confidence={confidence} />
            <div style={{ marginTop: 12 }}>
              <PitchTimeline points={timelinePoints} height={150} targetNote={freqToNote(targetFreq)} />
            </div>
            </div>

            <div className="v7Hud">
              <div className="hudRow">
                <div className="badge">{t('hud.live')}: <strong>{Math.round(pitch) || 0} Hz</strong></div>
                <div className="badge">{t('hud.target')}: <strong>{freqToNote(targetFreq)}</strong></div>
                <div className="badge">⭐ <strong>{"⭐".repeat(scoreToStars(liveScore))}</strong></div>
              </div>

              <ScoreMeter value={liveScore} max={100} label={t('hud.liveScore')} />

              <div className="hudRow">
                <div className="badge subtle">{t('hud.streak')}: <strong>{streak}</strong></div>
                <div className="badge subtle">{t('hud.confidence')}: <strong>{Math.round(confidence * 100)}%</strong></div>
              </div>
            </div>
          </div>
          <p>{volumeHint}</p>
          {autoPaused ? (
            <>
              <p className="warning">{pauseMsg}</p>
              <button onClick={() => { setAutoPaused(false); silenceStartRef.current = 0; }}>Продолжить</button>
            </>
          ) : (
            <button
              className={holding ? 'hold active' : 'hold'}
              onMouseDown={startHold}
              onMouseUp={() => setHolding(false)}
              onTouchStart={startHold}
              onTouchEnd={() => setHolding(false)}
            >
              {holding ? 'Удерживайте ноту…' : 'Удерживать ноту'}
            </button>
          )}
        </section>
      )}

      {stage === 'results' && (
        <section className="v6Section">
          <h2>Результаты</h2>
          <p>Итоговый счёт: <strong>{finalScore}</strong></p>
          <p>Уровень: <strong>{level}</strong></p>
          <p>{offer}</p>
          <p>🎁 Reveal-приз: напишите «ХОЧУ ПРИЗ» в DM и получите бонус-упражнение.</p>
          <p>Авто-DM сценарий: «Привет! Прошёл челлендж, хочу разбор голоса и план занятий».</p>

          <label>
            Стиль карточки:
            <select value={cardStyle} onChange={(e) => setCardStyle(e.target.value as CardStyle)}>
              <option value="minimal">Минимал</option>
              <option value="neon">Неон</option>
              <option value="karaoke">Караоке</option>
            </select>
          </label>

          <label>
            UTM шаблон:
            <select value={template} onChange={(e) => setTemplate(e.target.value as 'template_a' | 'template_b')}>
              <option value="template_a">Шаблон A</option>
              <option value="template_b">Шаблон B</option>
            </select>
          </label>

          <p>Ссылка для стикера: <a href={utmUrl} target="_blank" rel="noreferrer">{utmUrl}</a></p>
          <div className="shareRow">
          <button onClick={shareToStories}>Поделиться в Stories</button>
          <button onClick={shareResultText}>Поделиться текстом</button>
          </div>
          <a className="dm" href={`https://ig.me/m/vocal.jivoizvuk.ekb?text=${dmText}`} target="_blank" rel="noreferrer">Открыть DM с текстом</a>

          <h3>Последние игры</h3>
          <ul>{history.map((h) => <li key={h.date}>{new Date(h.date).toLocaleString()} — {h.score} ({h.level})</li>)}</ul>
          <p>Ежедневная серия: {streak} 🔥</p>

          <h3>Недельный рейтинг (локальный топ‑5)</h3>
          <ol>{leaderboard.map((x) => <li key={x.id}>{x.id}: {x.score}</li>)}</ol>

          <button onClick={resetAll}>Полный перезапуск челленджа</button>
        </section>
      )}
      </div>
    </div>
  );
}