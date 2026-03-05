import { useEffect, useRef } from 'react';

export type TimelinePoint = { t: number; cents: number; confidence: number };

export function PitchTimeline({
  points,
  height = 120,
}: {
  points: TimelinePoint[];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const h = height;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, h);

    // grid
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    for (const y of [h / 2, h / 2 - 30, h / 2 + 30]) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // thresholds: ±5, ±15, ±30 cents
    const mapY = (c: number) => {
      const clamped = Math.max(-100, Math.min(100, c));
      return h / 2 - (clamped / 100) * (h * 0.42);
    };

    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    for (const th of [5, 15, 30]) {
      ctx.moveTo(0, mapY(th));
      ctx.lineTo(width, mapY(th));
      ctx.moveTo(0, mapY(-th));
      ctx.lineTo(width, mapY(-th));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (!points.length) return;

    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const span = Math.max(1, t1 - t0);

    const mapX = (t: number) => ((t - t0) / span) * width;

    ctx.beginPath();
    let started = false;
    for (const p of points) {
      if (p.confidence < 0.8) continue;
      const x = mapX(p.t);
      const y = mapY(p.cents);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineWidth = 2;
    ctx.stroke();

    // dots (sparse)
    ctx.globalAlpha = 0.55;
    const step = Math.max(1, Math.floor(points.length / 32));
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
      if (p.confidence < 0.8) continue;
      const x = mapX(p.t);
      const y = mapY(p.cents);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [points, height]);

  return (
    <div style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
        }}
      />
    </div>
  );
}
