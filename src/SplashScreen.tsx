import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onStart: () => void;
};

export default function SplashScreen({ onStart }: Props) {
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    // Cleanup: we intentionally DO NOT stop the mic stream here.
    // Reason: Start button requests mic once (iPhone gesture requirement),
    // then the game can request again without prompting.
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // Close audio ctx if created (safe). Stream left alive.
      try {
        audioCtxRef.current?.close();
      } catch {}
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, []);

  async function requestMicForProEffects() {
    setStatus("Включаю микрофон…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Save stream globally so next screen can reuse permission quickly
      (window as any).__mvgMicStream = stream;

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioCtx();
      audioCtxRef.current = ctx;

      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;

      src.connect(analyser);
      analyserRef.current = analyser;

      setStatus("Микрофон включён ✅");
      startVizLoop();
      return true;
    } catch (e: any) {
      setStatus(
        e?.name === "NotAllowedError"
          ? "Микрофон не разрешён — можно включить позже в игре."
          : "Не удалось включить микрофон. Можно продолжить."
      );
      return false;
    }
  }

  function startVizLoop() {
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const timeData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      ctx.clearRect(0, 0, w, h);

      // waveform
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;

      ctx.beginPath();
      const midY = h * 0.52;
      const amp = h * 0.28;

      for (let i = 0; i < timeData.length; i++) {
        const x = (i / (timeData.length - 1)) * w;
        const v = (timeData[i] - 128) / 128;
        const y = midY + v * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(160,150,255,0.95)";
      ctx.stroke();

      // spectrum bars
      const bars = 40;
      const step = Math.floor(freqData.length / bars);
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = freqData[i * step] / 255;
        const bh = v * (h * 0.45);
        const x = i * barW + barW * 0.12;
        const y = h - bh;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(80,200,255,0.75)";
        ctx.fillRect(x, y, barW * 0.72, bh);
      }

      // pulse logo from volume
      const avg = average(freqData);
      const pulse = 1 + avg / 650;
      const glow = Math.min(1, avg / 140);
      const root = document.documentElement;
      root.style.setProperty("--logo-scale", String(pulse));
      root.style.setProperty("--logo-glow", String(glow));

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }

  async function handleStart() {
    if (leaving) return;
    // Start click => iPhone gesture OK => request mic immediately (no extra button)
    await requestMicForProEffects();

    setLeaving(true);
    window.setTimeout(() => onStart(), prefersReducedMotion ? 0 : 420);
  }

  return (
    <div className={`proSplash ${ready ? "proSplash--in" : ""} ${leaving ? "proSplash--out" : ""}`}>
      <div className="proSplash__bg" />
      <div className="proSplash__noise" />

      <div className="proSplash__wrap">
        <div className="proSplash__card">
          <div className="proSplash__logoRow">
            <div className="proSplash__logoFrame">
              <img className="proSplash__logo" src="/logo.png" alt="Jivoi Zvuk" />
              <div className="proSplash__logoGlow" />
            </div>
          </div>

          <div className="proSplash__text">
            <h1 className="proSplash__title">MiniVocalGame</h1>
            <p className="proSplash__sub">Tap Start → we enable mic → you play.</p>
          </div>

          <div className="proSplash__viz">
            <canvas ref={canvasRef} className="proSplash__canvas" />
          </div>

          <div className="proSplash__actions">
            <button className="proSplash__btn proSplash__btn--main" onClick={handleStart}>
              Start
            </button>
          </div>

          {status && <div className="proSplash__status">{status}</div>}

          <div className="proSplash__hint">
            iPhone: Safari. Если микрофон не включился — разреши “AA → Website Settings → Microphone”.
          </div>
        </div>
      </div>

      <style>{css(prefersReducedMotion)}</style>
    </div>
  );
}

function average(arr: Uint8Array) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function css(reduceMotion: boolean) {
  return `
  :root{
    --logo-scale: 1;
    --logo-glow: 0.35;
  }

  .proSplash{
    position:fixed; inset:0; z-index:60; overflow:hidden;
    background:#05060a; color: rgba(255,255,255,0.92);
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  }

  .proSplash__bg{
    position:absolute; inset:-20%;
    background:
      radial-gradient(1200px 700px at 50% 35%, rgba(130,120,255,0.28), transparent 55%),
      radial-gradient(900px 600px at 70% 55%, rgba(80,200,255,0.14), transparent 60%),
      radial-gradient(900px 600px at 30% 60%, rgba(255,120,220,0.10), transparent 60%),
      linear-gradient(180deg, #05060a 0%, #050513 60%, #04040a 100%);
    transform: translateZ(0);
    ${reduceMotion ? "" : "animation: proBg 14s ease-in-out infinite;"}
  }
  @keyframes proBg{
    0%{ transform: translate3d(0,0,0) scale(1); filter: saturate(1); }
    50%{ transform: translate3d(0,-1.2%,0) scale(1.03); filter: saturate(1.1); }
    100%{ transform: translate3d(0,0,0) scale(1); filter: saturate(1); }
  }

  .proSplash__noise{
    position:absolute; inset:0; pointer-events:none;
    opacity:0.10;
    background-image:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
    mix-blend-mode: overlay;
    ${reduceMotion ? "" : "animation: proNoise 1.3s steps(2,end) infinite;"}
  }
  @keyframes proNoise{
    0%{ transform: translate3d(0,0,0); }
    25%{ transform: translate3d(-2%,1%,0); }
    50%{ transform: translate3d(1%,-2%,0); }
    75%{ transform: translate3d(2%,2%,0); }
    100%{ transform: translate3d(0,0,0); }
  }

  .proSplash__wrap{
    position:relative;
    height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    padding: 22px;
  }

  .proSplash__card{
    width: min(760px, 100%);
    border-radius: 22px;
    padding: 18px 18px 16px;
    background: rgba(18,18,28,0.55);
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: 0 30px 110px rgba(0,0,0,0.55);
    backdrop-filter: blur(10px);
    opacity: 0;
    transform: translate3d(0,10px,0) scale(.99);
    transition: opacity 450ms ease, transform 450ms ease;
  }
  .proSplash--in .proSplash__card{
    opacity: 1;
    transform: translate3d(0,0,0) scale(1);
  }
  .proSplash--out .proSplash__card{
    opacity: 0;
    transform: translate3d(0,8px,0) scale(.99);
  }

  .proSplash__logoRow{
    display:flex;
    justify-content:center;
  }
  .proSplash__logoFrame{
    position:relative;
    width:min(520px, 92vw);
    border-radius: 18px;
    padding: 18px 14px;
    background: rgba(0,0,0,0.22);
    border: 1px solid rgba(255,255,255,0.10);
    overflow:hidden;
  }
  .proSplash__logo{
    width:100%;
    display:block;
    transform: scale(var(--logo-scale));
    transition: transform 90ms linear;
    filter:
      drop-shadow(0 0 10px rgba(150,140,255, calc(0.25 + var(--logo-glow))))
      drop-shadow(0 0 26px rgba(110,180,255, calc(0.18 + var(--logo-glow))))
      drop-shadow(0 0 60px rgba(140,130,255, calc(0.12 + var(--logo-glow))));
  }
  .proSplash__logoGlow{
    position:absolute; inset:-35%;
    background: radial-gradient(circle at 50% 40%, rgba(140,130,255,0.35), transparent 55%);
    mix-blend-mode: screen;
    opacity: calc(0.35 + var(--logo-glow));
    pointer-events:none;
    ${reduceMotion ? "" : "animation: proGlow 2.2s ease-in-out infinite alternate;"}
  }
  @keyframes proGlow{
    from{ transform: scale(1); }
    to{ transform: scale(1.10); }
  }

  .proSplash__text{
    text-align:center;
    margin-top: 12px;
  }
  .proSplash__title{
    margin: 10px 0 4px;
    font-size: clamp(22px, 3.2vw, 34px);
    font-weight: 900;
    letter-spacing: 0.2px;
    text-shadow: 0 0 18px rgba(120,110,255,0.20);
  }
  .proSplash__sub{
    margin:0 0 8px;
    color: rgba(255,255,255,0.72);
    font-size: 14px;
  }

  .proSplash__viz{
    margin-top: 10px;
    border-radius: 16px;
    padding: 10px;
    background: rgba(0,0,0,0.18);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .proSplash__canvas{
    width: 100%;
    height: 90px;
    display:block;
    border-radius: 12px;
  }

  .proSplash__actions{
    margin-top: 12px;
    display:flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content:center;
  }
  .proSplash__btn{
    flex: 0 1 320px;
    border: none;
    border-radius: 14px;
    padding: 13px 14px;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
    color: rgba(255,255,255,0.92);
  }
  .proSplash__btn--main{
    background: linear-gradient(135deg, rgba(125,110,255,0.95), rgba(75,180,255,0.72));
    box-shadow: 0 16px 44px rgba(120,110,255,0.20);
  }
  .proSplash__btn:active{ transform: translateY(1px); }

  .proSplash__status{
    margin-top: 10px;
    text-align:center;
    font-size: 13px;
    color: rgba(255,255,255,0.72);
  }
  .proSplash__hint{
    margin-top: 10px;
    text-align:center;
    font-size: 12px;
    color: rgba(255,255,255,0.55);
  }
`;
}
