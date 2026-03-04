import { useEffect, useMemo, useRef, useState } from 'react';

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

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

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

function detectPitchFromBuffer(buffer: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return 0;

  const SIZE = buffer.length;
  const correlations = new Array(SIZE).fill(0);
  let bestOffset = -1;
  let bestCorrelation = 0;

  for (let offset = 8; offset < SIZE / 2; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < SIZE / 2; i += 1) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation = 1 - correlation / (SIZE / 2);
    correlations[offset] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset > 0 && bestCorrelation > 0.75) {
    let shift = 0;
    if (bestOffset + 1 < correlations.length) {
      shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
    }
    return sampleRate / (bestOffset + 8 * shift);
  }
  return 0;
}

function levelFromScore(score: number): string {
  if (score >= 85) return 'Профи';
  if (score >= 60) return 'Средний';
  return 'Новичок';
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function MiniVocalGame() {
  const [stage, setStage] = useState<Stage>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('newbie');
  const [calibStep, setCalibStep] = useState<CalibStep>('low');
  const [calibLeftMs, setCalibLeftMs] = useState(CALIBRATION_MS);
  const [range, setRange] = useState<{ low: number; high: number }>({ low: 165, high: 440 });
  const [micReady, setMicReady] = useState(false);
  const [pitch, setPitch] = useState(0);
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

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
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
      const buffer = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buffer);
      const p = detectPitchFromBuffer(buffer, audioCtxRef.current.sampleRate);
      const rms = Math.sqrt(buffer.reduce((acc, item) => acc + item * item, 0) / buffer.length);
      setPitch(p);
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
    <div className="game">
      <h1>MiniVocalGame — IG Challenge</h1>
      <p className="muted">Ограничение Instagram: авто‑публикация сторис со стикерами ограничена. Используйте Share Sheet + добавьте стикеры вручную.</p>

      {stage === 'setup' && (
        <section className="card">
          <h2>Настройка</h2>
          <label>
            Сложность:
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="newbie">newbie</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <button onClick={connectMic} disabled={micReady}>{micReady ? 'Микрофон подключён' : 'Подключить микрофон'}</button>
          <button onClick={beginCalibration} disabled={!micReady}>Начать калибровку</button>
        </section>
      )}

      {stage === 'calibration' && (
        <section className="card">
          <h2>Калибровка диапазона</h2>
          <p>{calibStep === 'low' ? 'Спойте низкую комфортную ноту (6 сек)' : 'Спойте высокую комфортную ноту (6 сек)'}</p>
          <p>Осталось: {(calibLeftMs / 1000).toFixed(1)} c</p>
          <p>Текущая нота: {freqToNote(pitch)} ({Math.round(pitch)} Hz)</p>
          <p>{volumeHint}</p>
        </section>
      )}

      {stage === 'game' && (
        <section className="card">
          <h2>Раунд {roundIndex + 1} / {TOTAL_ROUNDS}</h2>
          <p>Целевая нота: <strong>{freqToNote(targetFreq)}</strong> ({Math.round(targetFreq)} Hz)</p>
          <p>Ваш тон: {freqToNote(pitch)} ({Math.round(pitch)} Hz)</p>
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
        <section className="card">
          <h2>Результаты</h2>
          <p>Итоговый счёт: <strong>{finalScore}</strong></p>
          <p>Уровень: <strong>{level}</strong></p>
          <p>{offer}</p>
          <p>🎁 Reveal-приз: напишите «ХОЧУ ПРИЗ» в DM и получите бонус-упражнение.</p>
          <p>Авто-DM сценарий: «Привет! Прошёл челлендж, хочу разбор голоса и план занятий».</p>

          <label>
            Стиль карточки:
            <select value={cardStyle} onChange={(e) => setCardStyle(e.target.value as CardStyle)}>
              <option value="minimal">minimal</option>
              <option value="neon">neon</option>
              <option value="karaoke">karaoke</option>
            </select>
          </label>

          <label>
            UTM template:
            <select value={template} onChange={(e) => setTemplate(e.target.value as 'template_a' | 'template_b')}>
              <option value="template_a">template_a</option>
              <option value="template_b">template_b</option>
            </select>
          </label>

          <p>Link sticker URL: <a href={utmUrl} target="_blank" rel="noreferrer">{utmUrl}</a></p>
          <button onClick={shareToStories}>Поделиться в Stories</button>
          <a className="dm" href={`https://ig.me/m/vocal.jivoizvuk.ekb?text=${dmText}`} target="_blank" rel="noreferrer">Открыть DM с текстом</a>

          <h3>Последние игры</h3>
          <ul>{history.map((h) => <li key={h.date}>{new Date(h.date).toLocaleString()} — {h.score} ({h.level})</li>)}</ul>
          <p>Ежедневная серия: {streak} 🔥</p>

          <h3>Weekly leaderboard (local top-5)</h3>
          <ol>{leaderboard.map((x) => <li key={x.id}>{x.id}: {x.score}</li>)}</ol>

          <button onClick={resetAll}>Полный перезапуск челленджа</button>
        </section>
      )}
    </div>
  );
}
