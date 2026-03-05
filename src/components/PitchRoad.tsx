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

// Smule-style pitch road: target line in the middle (0 cents),
// player trace as colored segments by grade.
export default function PitchRoad({ points, windowMs = 6000 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalized = useMemo(() => {
    if (!points.length) return [] as PitchPoint[];
    const end = points[points.length - 1].t;
    const start = end - windowMs;
    return points.filter((p) => p.t >= start);
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
    const centsToY = (c: number) => mid - c * 2; // scale

    // guide bands (+/- 5, 15, 30 cents)
    const bands = [5, 15, 30];
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

    // target line (0 cents)
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    if (normalized.length < 2) return;

    const endT = normalized[normalized.length - 1].t;
    const startT = endT - windowMs;
    const xForT = (t: number) => ((t - startT) / windowMs) * w;

    const colorFor = (g: PitchGrade) => {
      switch (g) {
        case "perfect":
          return "rgba(255,215,0,0.95)"; // gold
        case "great":
          return "rgba(0,255,213,0.95)"; // teal
        case "good":
          return "rgba(135,206,235,0.95)"; // sky
        default:
          return "rgba(255,99,71,0.90)"; // tomato
      }
    };

    // draw colored segments
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 1; i < normalized.length; i++) {
      const a = normalized[i - 1];
      const b = normalized[i];
      const x1 = xForT(a.t);
      const y1 = centsToY(a.cents);
      const x2 = xForT(b.t);
      const y2 = centsToY(b.cents);
      ctx.strokeStyle = colorFor(b.grade);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
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
