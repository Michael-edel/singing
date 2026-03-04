import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onStart: () => void;
};

export default function SplashScreen({ onStart }: Props) {
  const [leaving, setLeaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // soft baseline
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // animated wave
      ctx.globalAlpha = 0.9;
      ctx.beginPath();

      const amp = Math.min(28, h * 0.22);
      const freq = 0.018;

      for (let x = 0; x <= w; x += 2) {
        const y =
          h / 2 +
          Math.sin(x * freq + t) * amp * 0.65 +
          Math.sin(x * freq * 0.55 - t * 1.2) * amp * 0.22 +
          Math.sin(x * freq * 1.6 + t * 0.7) * amp * 0.13;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      t += prefersReducedMotion ? 0 : 0.06;
      raf = requestAnimationFrame(draw);
    };

    // styling (no hard-coded colors, just defaults)
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(120,110,255,0.85)";

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [prefersReducedMotion]);

  function handleStart() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onStart(), prefersReducedMotion ? 0 : 420);
  }

  return (
    <div className={`splash ${leaving ? "splash--out" : ""}`}>
      <div className="splash__bg" />
      <div className="splash__noise" />

      <div className="splash__content">
        <div className="splash__card">
          <div className="splash__top">
            <div className="splash__logoWrap" aria-hidden="true">
              <img className="splash__logo" src="/logo.png" alt="" />
              <div className="splash__glow" />
            </div>
          </div>

          <div className="splash__mid">
            <canvas ref={canvasRef} className="splash__wave" />
          </div>

          <div className="splash__bottom">
            <h1 className="splash__title">
              MiniVocalGame <span className="splash__dash">—</span> IG Challenge
            </h1>
            <p className="splash__subtitle">
              Подключи микрофон, откалибруй диапазон — и удержи ноту!
            </p>

            <button className="splash__btn" onClick={handleStart}>
              Start
            </button>

            <div className="splash__hint">
              Совет: на iPhone лучше открывать в Safari. Микрофон работает только по HTTPS.
            </div>
          </div>
        </div>
      </div>

      <style>{styles(prefersReducedMotion)}</style>
    </div>
  );
}

function styles(reduceMotion: boolean) {
  return `
  .splash{
    position: fixed;
    inset: 0;
    z-index: 1000;
    overflow: hidden;
    background: #06070a;
    color: rgba(255,255,255,0.92);
  }

  .splash__bg{
    position:absolute; inset:-20%;
    background:
      radial-gradient(1200px 700px at 50% 35%, rgba(130,120,255,0.25), transparent 55%),
      radial-gradient(900px 600px at 70% 55%, rgba(80,200,255,0.12), transparent 60%),
      radial-gradient(900px 600px at 30% 60%, rgba(255,120,220,0.10), transparent 60%),
      linear-gradient(180deg, #06070a 0%, #050510 60%, #04040a 100%);
    transform: translateZ(0);
    ${reduceMotion ? "" : "animation: bgFloat 14s ease-in-out infinite;"}
  }

  @keyframes bgFloat{
    0%{ transform: translate3d(0,0,0) scale(1); filter: saturate(1); }
    50%{ transform: translate3d(0,-1.2%,0) scale(1.03); filter: saturate(1.15); }
    100%{ transform: translate3d(0,0,0) scale(1); filter: saturate(1); }
  }

  .splash__noise{
    position:absolute; inset:0;
    pointer-events:none;
    opacity: 0.10;
    background-image:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
    mix-blend-mode: overlay;
    ${reduceMotion ? "" : "animation: noiseMove 1.3s steps(2,end) infinite;"}
  }

  @keyframes noiseMove{
    0%{ transform: translate3d(0,0,0); }
    25%{ transform: translate3d(-2%,1%,0); }
    50%{ transform: translate3d(1%,-2%,0); }
    75%{ transform: translate3d(2%,2%,0); }
    100%{ transform: translate3d(0,0,0); }
  }

  .splash__content{
    position:relative;
    height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    padding: 24px;
  }

  .splash__card{
    width: min(860px, 100%);
    border-radius: 22px;
    padding: 18px;
    background: rgba(20,20,32,0.55);
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: 0 30px 100px rgba(0,0,0,0.55);
    backdrop-filter: blur(10px);
    ${reduceMotion ? "" : "animation: cardIn 700ms cubic-bezier(.2,.9,.2,1) both;"}
  }

  @keyframes cardIn{
    from{ opacity:0; transform: translate3d(0,10px,0) scale(.98); }
    to{ opacity:1; transform: translate3d(0,0,0) scale(1); }
  }

  .splash__top{ padding: 6px 6px 2px; }
  .splash__mid{ padding: 10px 6px 6px; }
  .splash__bottom{ padding: 0 6px 8px; }

  .splash__logoWrap{
    position:relative;
    border-radius: 16px;
    overflow:hidden;
    border: 1px solid rgba(255,255,255,0.10);
    background: rgba(0,0,0,0.18);
  }

  .splash__logo{
    width:100%;
    display:block;
    object-fit:contain;
    padding: 10px 8px;
    transform: translateZ(0);
    ${reduceMotion ? "" : "animation: logoPop 900ms cubic-bezier(.2,.9,.2,1) both;"}
  }

  @keyframes logoPop{
    from{ opacity:0; transform: scale(.96); filter: contrast(1.05) brightness(0.92); }
    to{ opacity:1; transform: scale(1); filter: contrast(1.18) brightness(1.03); }
  }

  .splash__glow{
    position:absolute; inset:-30%;
    background: radial-gradient(circle at 50% 45%, rgba(140,130,255,0.40), transparent 55%);
    mix-blend-mode: screen;
    pointer-events:none;
    ${reduceMotion ? "" : "animation: glowPulse 2.2s ease-in-out infinite alternate;"}
  }

  @keyframes glowPulse{
    from{ opacity: .25; transform: scale(1); }
    to{ opacity: .65; transform: scale(1.08); }
  }

  .splash__wave{
    width:100%;
    height: 80px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.18);
    display:block;
  }

  .splash__title{
    margin: 10px 0 6px;
    font-size: clamp(22px, 3.2vw, 34px);
    font-weight: 800;
    letter-spacing: 0.2px;
    text-shadow: 0 0 18px rgba(120,110,255,0.20);
    ${reduceMotion ? "" : "animation: neonFlicker 5.5s infinite;"}
  }

  .splash__dash{ opacity:.75; }

  @keyframes neonFlicker{
    0%, 100%{ filter: brightness(1); }
    92%{ filter: brightness(1); }
    93%{ filter: brightness(0.88); }
    94%{ filter: brightness(1.05); }
    96%{ filter: brightness(0.92); }
    97%{ filter: brightness(1); }
  }

  .splash__subtitle{
    margin: 0 0 12px;
    color: rgba(255,255,255,0.72);
    line-height: 1.45;
    font-size: 14px;
  }

  .splash__btn{
    width: 100%;
    border: none;
    border-radius: 14px;
    padding: 14px 16px;
    font-size: 16px;
    font-weight: 800;
    color: rgba(255,255,255,0.94);
    background: linear-gradient(135deg, rgba(125,110,255,0.95), rgba(75,180,255,0.70));
    box-shadow: 0 14px 40px rgba(120,110,255,0.20);
    cursor: pointer;
    transform: translateZ(0);
  }
  .splash__btn:active{ transform: translateY(1px); }

  .splash__hint{
    margin-top: 10px;
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    text-align:center;
  }

  .splash--out .splash__card{
    ${reduceMotion ? "opacity: 0;" : "animation: cardOut 420ms ease both;"}
  }

  @keyframes cardOut{
    to{ opacity:0; transform: translate3d(0,8px,0) scale(.99); }
  }
`;
}
