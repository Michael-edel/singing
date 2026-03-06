import { useEffect, useMemo, useRef } from "react";

export type PitchGrade = "perfect" | "great" | "good" | "bad";

export type PitchPoint = {
  t: number;
  cents: number;
  grade: PitchGrade;
};

type Props = {
  points: PitchPoint[];
  windowMs?: number;
};

const colorFor = (g: PitchGrade) => {
  switch (g) {
    case "perfect":
      return "rgba(255,215,0,0.95)";
    case "great":
      return "rgba(0,255,213,0.95)";
    case "good":
      return "rgba(135,206,235,0.95)";
    default:
      return "rgba(255,99,71,0.90)";
  }
};

export default function PitchRoad({ points, windowMs = 6000 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalized = useMemo(() => {
    if (!points.length) return [] as PitchPoint[];
    const end = points[points.length - 1].t;
    const start = end - windowMs;
    return points
      .filter((p) => p.t >= start)
      .map((p) => ({ ...p, cents: Math.max(-50, Math.min(50, p.cents)) }));
  }, [points, windowMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = Math.max(280, Math.round(rect.width || 720));
    const cssHeight = Math.max(120, Math.round(rect.height || 180));
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const centsToY = (c: number) => mid - c * (h / 120);

    const bands = [5, 15, 30, 50];
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    for (const b of bands) {
      ctx.beginPath();
      ctx.moveTo(0, centsToY(b));
      ctx.lineTo(w, centsToY(b));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, centsToY(-b));
      ctx.lineTo(w, centsToY(-b));
      ctx.stroke();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    if (!normalized.length) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Пойте, чтобы увидеть линию попадания", w / 2, mid + 5);
      return;
    }

    const endT = normalized[normalized.length - 1].t;
    const startT = endT - windowMs;
    const xForT = (t: number) => ((t - startT) / windowMs) * w;

    if (normalized.length < 2) {
      const only = normalized[0];
      ctx.fillStyle = colorFor(only.grade);
      ctx.shadowColor = colorFor(only.grade);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(Math.max(8, Math.min(w - 8, xForT(only.t))), centsToY(only.cents), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 1; i < normalized.length; i++) {
      const a = normalized[i - 1];
      const b = normalized[i];
      ctx.strokeStyle = colorFor(b.grade);
      ctx.beginPath();
      ctx.moveTo(xForT(a.t), centsToY(a.cents));
      ctx.lineTo(xForT(b.t), centsToY(b.cents));
      ctx.stroke();
    }

    const last = normalized[normalized.length - 1];
    ctx.fillStyle = colorFor(last.grade);
    ctx.shadowColor = colorFor(last.grade);
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(Math.max(8, Math.min(w - 8, xForT(last.t))), centsToY(last.cents), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [normalized, windowMs]);

  return (
    <div className="pitchRoadWrap">
      <canvas ref={canvasRef} className="pitchRoad" />
      <div className="pitchRoadLegend" aria-hidden>
        <span>⭐ идеально</span>
        <span>✨ отлично</span>
        <span>👍 нормально</span>
        <span>• мимо</span>
      </div>
    </div>
  );
}
