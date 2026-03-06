import { useEffect, useMemo, useRef } from "react";

export type PitchGrade = "perfect" | "great" | "good" | "bad";

export type PitchPoint = {
  t: number; // epoch ms
  cents: number; // signed
  grade: PitchGrade;
};

type Props = {
  points: PitchPoint[];
  windowMs?: number; // default 6000
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

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const centsToY = (c: number) => mid - c * 2;
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

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    for (const b of [5, 15, 30]) {
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

    if (normalized.length === 1) {
      const only = normalized[0];
      ctx.fillStyle = colorFor(only.grade);
      ctx.beginPath();
      ctx.arc(xForT(only.t), centsToY(only.cents), 5, 0, Math.PI * 2);
      ctx.fill();
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
    ctx.arc(xForT(last.t), centsToY(last.cents), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [normalized, windowMs]);

  return (
    <div className="pitchRoadWrap">
      <canvas ref={canvasRef} className="pitchRoad" width={720} height={220} />
      <div className="pitchRoadLegend" aria-hidden>
        <span>⭐ идеально</span>
        <span>✨ отлично</span>
        <span>👍 нормально</span>
        <span>• мимо</span>
      </div>
    </div>
  );
}
