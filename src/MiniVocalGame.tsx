import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AccuracyRing } from './components/AccuracyRing';
import { PitchRingSmule } from './components/PitchRingSmule';
import { ScoreMeter } from './components/ScoreMeter';
import PitchRoad, { type PitchGrade, type PitchPoint } from './components/PitchRoad';
import { PitchEngine } from './audio/PitchEngine';
import { useI18n } from './i18n';

const TOTAL_ROUNDS = 5;
const CALIBRATION_MS = 6000;
const ROUND_MS = 2500;
const SILENCE_AUTOPAUSE_MS = 1000;
const HISTORY_KEY = 'mini-vocal-history';
const STREAK_KEY = 'mini-vocal-streak';
const BOARD_KEY = 'mini-vocal-weekly-board';

type Stage = 'setup' | 'calibration' | 'game' | 'results';
type Difficulty = 'newbie' | 'pro';
type CalibStep = 'low' | 'high' | 'done';
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

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MiniVocalGame({ user, onSubmitScore }: { user?: any; onSubmitScore?: (p: { score: number; accuracy: number }) => void }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('newbie');
  const [calibStep, setCalibStep] = useState<CalibStep>('low');
  const [calibLeftMs, setCalibLeftMs] = useState(CALIBRATION_MS);
  const [range, setRange] = useState<{ low: number; high: number }>({ low: 165, high: 440 });
  const [micReady, setMicReady] = useState(false);
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('mv_onboard_v21') !== '1'; } catch { return true; }
  });

  const [pitch, setPitch] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [volume, setVolume] = useState(0);
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
  const [liveAccuracy, setLiveAccuracy] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [lastRoundScore, setLastRoundScore] = useState<number | null>(null);
  const lastUiTickRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pitchEngineRef = useRef<PitchEngine | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothHzRef = useRef<number | null>(null);
  // V24: allocation-free pitch smoothing (median-of-5 + EMA)
  const hzRingRef = useRef<Float64Array | null>(null);
  const hzRingTmpRef = useRef<Float64Array | null>(null);
  const hzRingIdxRef = useRef(0);
  const hzRingCountRef = useRef(0);
  const emaHzRef = useRef<number | null>(null);
  const audioBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const calibCollectedRef = useRef<number[]>([]);
  const calibStartRef = useRef<number>(0);

  const holdStartRef = useRef<number>(0);
  const silenceStartRef = useRef<number>(0);
  const centsSamplesRef = useRef<number[]>([]);
  const totalSilentMsRef = useRef<number>(0);

  // V15: pitch trace for Smule-style road
  const tracePointsRef = useRef<PitchPoint[]>([]);
  const [pitchRoadPoints, setPitchRoadPoints] = useState<PitchPoint[]>([]);
  const lastRoadTickRef = useRef<number>(0);

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
      // Ensure we have an allocation-free pitch engine instance for this analyser size
      if (!pitchEngineRef.current || pitchEngineRef.current.bufferSize !== analyserRef.current.fftSize) {
        pitchEngineRef.current = new PitchEngine({
          sampleRate: audioCtxRef.current.sampleRate,
          bufferSize: analyserRef.current.fftSize,
          minHz: 80,
          maxHz: 1000,
          threshold: 0.15,
          minProbability: 0.7,
          emaAlpha: 0.2,
        });
      }

      analyserRef.current.getFloatTimeDomainData(buffer);

      const res = pitchEngineRef.current.process(buffer);
      const rms = res?.rms ?? 0;
      setConfidence(res ? res.probability : 0);

      // V24: voiced gate + smoothing to reduce jitter (mobile-friendly)
      const prob = res?.probability ?? 0;
      const voiced = !!res && prob >= 0.6 && rms >= 0.012;
      let hz = voiced ? res!.hz : 0;

      if (hz > 0) {
        // init buffers once (no allocations in hot loop)
        if (!hzRingRef.current) hzRingRef.current = new Float64Array(5);
        if (!hzRingTmpRef.current) hzRingTmpRef.current = new Float64Array(5);

        const ring = hzRingRef.current;
        const tmp = hzRingTmpRef.current;

        ring[hzRingIdxRef.current] = hz;
        hzRingIdxRef.current = (hzRingIdxRef.current + 1) % ring.length;
        hzRingCountRef.current = Math.min(ring.length, hzRingCountRef.current + 1);

        // copy to tmp and sort (small n=5)
        const n = hzRingCountRef.current;
        for (let i = 0; i < n; i++) tmp[i] = ring[i];
        for (let i = 1; i < n; i++) {
          const key = tmp[i];
          let j = i - 1;
          while (j >= 0 && tmp[j] > key) {
            tmp[j + 1] = tmp[j];
            j--;
          }
          tmp[j + 1] = key;
        }
        const medianHz = tmp[Math.floor((n - 1) / 2)];

        const prev = emaHzRef.current;
        const alpha = 0.2;
        const smoothHz = prev == null ? medianHz : prev + alpha * (medianHz - prev);
        emaHzRef.current = smoothHz;
        smoothHzRef.current = smoothHz;

        hz = smoothHz;
      } else {
        smoothHzRef.current = null;
        hzRingIdxRef.current = 0;
        hzRingCountRef.current = 0;
        emaHzRef.current = null;
        pitchEngineRef.current.resetSmoothing();
      }

      setPitch(hz);
      setVolume(rms);
      const p = hz;

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

          // V15: pitch trace points (throttled UI updates)
          if (res && res.probability >= 0.6) {
            const cents = hzToCentsDiff(p, targetFreq);
            const grade = gradeFromAbsCents(Math.abs(cents));
            tracePointsRef.current.push({ t: Date.now(), cents, grade });
            // keep last ~8s to avoid growth
            const cutoff = Date.now() - 8000;
            if (tracePointsRef.current.length > 500) {
              tracePointsRef.current = tracePointsRef.current.filter((pt) => pt.t >= cutoff);
            }
            if (now - (lastRoadTickRef.current || 0) > 120) {
              lastRoadTickRef.current = now;
              setPitchRoadPoints([...tracePointsRef.current]);
            }
          }
        // V21: live accuracy + hold progress (update ~10fps)
        const centsErr = Math.abs(hzToCentsDiff(p, targetFreq));
        const accuracyPct = clamp(100 - centsErr * 2, 0, 100);

        const elapsedHold = now - holdStartRef.current;
        const progress = clamp(elapsedHold / ROUND_MS, 0, 1);

        const last = lastUiTickRef.current || 0;
        if (now - last > 100) {
          lastUiTickRef.current = now;
          setLiveAccuracy(Math.round(accuracyPct));
          setHoldProgress(progress);
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

  const startGameFromSetup = async () => {
    if (!micReady) {
      await connectMic();
    }
    setStage('game');
    prepareRound(0);
  };


  const playReferenceTone = async () => {
    try {
      // ensure audio context exists and is resumed (required on iOS)
      if (!audioCtxRef.current) {
        await connectMic();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = targetFreq;

      const now = ctx.currentTime;
      // soft fade-in/out to avoid click
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.82);
      osc.onended = () => {
        try { osc.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      };
    } catch {}
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
    tracePointsRef.current = [];
    setPitchRoadPoints([]);
  };

  const startHold = () => {
    setLastRoundScore(null);
    setLiveAccuracy(0);
    setHoldProgress(0);
    lastUiTickRef.current = 0;
    if (autoPaused) return;
    setHolding(true);
    holdStartRef.current = performance.now();
    silenceStartRef.current = 0;
    centsSamplesRef.current = [];
    totalSilentMsRef.current = 0;
    tracePointsRef.current = [];
    setPitchRoadPoints([]);
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
    setLastRoundScore(Math.round(score));

    const one: RoundResult = {
      targetFreq,
      avgCentsError: avgAbsCents,
      instabilityPenalty,
      silencePenalty,
      score
    };

    setResults((prev) => {
      const next = [...prev, one];
      if (next.length >= TOTAL_ROUNDS) {
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
    const boardRaw = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]') as Array<LeaderRecord & { week: string }>;
    const board = [...boardRaw, { id: `anon-${Math.random().toString(36).slice(2, 7)}`, score: Math.round(finalScore), week: weekTag }]
      .filter((x) => x.week === weekTag)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    localStorage.setItem(BOARD_KEY, JSON.stringify(board));
    setLeaderboard(board.map(({ id, score }) => ({ id, score })));

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

          <div className="homeGamePrimary">
            <button
              className="homeGameMicBtn"
              type="button"
              onClick={() => startGameFromSetup()}
            >
              <span className="homeGameMicIcon">🎙️</span>
              <span className="homeGameMicText">{micReady ? "Начать игру" : "Включить микрофон"}</span>
            </button>
            <div className="homeGameHint">
              {micReady ? "Готово! Нажмите, чтобы начать." : "При первом запуске нужно разрешить доступ к микрофону."}
            </div>
          </div>

          <button
            type="button"
            className="homeGameAdvancedToggle"
            onClick={() => setShowAdvancedSetup((v) => !v)}
          >
            {showAdvancedSetup ? "Скрыть настройки" : "Настройки"}
          </button>

          {showAdvancedSetup ? (
            <div className="homeGameAdvanced">
              <label className="homeGameRow">
                <span>Сложность</span>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  <option value="newbie">Новичок</option>
                  <option value="pro">Профи</option>
                </select>
              </label>

              <div className="homeGameRowBtns">
                <button onClick={connectMic} disabled={micReady} type="button">
                  {micReady ? "Микрофон подключён" : "Подключить микрофон"}
                </button>
                <button onClick={beginCalibration} disabled={!micReady} type="button">
                  Калибровка диапазона
                </button>
              </div>

              <div className="homeGameFinePrint">
                Калибровка улучшает подбор нот под ваш голос.
              </div>
            </div>
          ) : null}
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
            </div>

            <div className="v7Hud">
              <div className="hudRow">
                <div className="badge">{t('hud.live')}: <strong>{Math.round(pitch) || 0} Hz</strong></div>
                <div className="badge">{t('hud.target')}: <strong>{freqToNote(targetFreq)}</strong></div>
                <button className="badge btn" onClick={playReferenceTone} title={t('hud.playTone')}>🔊 {t('hud.playTone')}</button>
                <div className="badge">⭐ <strong>{'⭐'.repeat(starsFromAbsCents(Math.abs(liveCents || 0)))}</strong></div>
              </div>

              {holding ? (
                <div>
                  <ScoreMeter value={liveAccuracy} max={100} label={t('hud.accuracy')} />
                  <div className="holdProgress">
                    <div className="holdProgressBar" style={{ width: `${Math.round(holdProgress * 100)}%` }} />
                  </div>
                  <div className="hint subtle">
                    {t('hud.holdHint')} <strong>{Math.max(0, Math.ceil((ROUND_MS - (performance.now() - holdStartRef.current)) / 1000))}</strong>s
                  </div>
                </div>
              ) : (
                <div className="hint">
                  {t('hud.holdToScore')}
                  {lastRoundScore !== null ? (
                    <div className="hintScore">{t('hud.roundScore')}: <strong>{lastRoundScore}</strong></div>
                  ) : null}
                </div>
              )}

              <div className="hudRow">
                <div className="badge subtle">{t('hud.streak')}: <strong>{streak}</strong></div>
                <div className="badge subtle">{t('hud.confidence')}: <strong>{Math.round(confidence * 100)}%</strong></div>
              </div>
            </div>
          </div>

          <PitchRoad points={pitchRoadPoints} />

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
          <p>Награда: <strong>{'⭐'.repeat(starsFromScore(finalScore))}</strong></p>
          <p>Уровень: <strong>{level}</strong></p>
          <p>{offer}</p>
          <p>🎁 Приз: напишите «ХОЧУ ПРИЗ» в DM и получите бонус-упражнение.</p>
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
