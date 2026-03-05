import { useEffect, useRef } from 'react';

export type TimelinePoint = { t: number; cents: number; confidence: number };

function gradeFromCents(absCents: number): 'perfect' | 'great' | 'good' | 'bad' {
  if (absCents <= 5) return 'perfect';
  if (absCents <= 15) return 'great';
  if (absCents <= 30) return 'good';
  return 'bad';
}

function colorForGrade(g: ReturnType<typeof gradeFromCents>) {
  // vivid but still readable on dark background
  switch (g) {
    case 'perfect':
      return 'rgba(120, 255, 170, 0.95)';
    case 'great':
      return 'rgba(120, 210, 255, 0.95)';
    case 'good':
      return 'rgba(255, 220, 120, 0.95)';
    default:
      return 'rgba(255, 120, 120, 0.95)';
  }
}

export function PitchTimeline({
  points,
  height = 140,
  targetNote,
}: {
  points: TimelinePoint[];
  height?: number;
  targetNote?: string;
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

    // Background vignette
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, h);

    const mapY = (c: number) => {
      const clamped = Math.max(-100, Math.min(100, c));
      return h / 2 - (clamped / 100) * (h * 0.42);
    };

    // Center (target) line
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(width, h / 2);
    ctx.stroke();

    // Threshold lines
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    for (const th of [5, 15, 30]) {
      ctx.moveTo(0, mapY(th));
      ctx.lineTo(width, mapY(th));
      ctx.moveTo(0, mapY(-th));
      ctx.lineTo(width, mapY(-th));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    if (targetNote) {
      ctx.fillText(`Target: ${targetNote} (0c)`, 12, 10);
    } else {
      ctx.fillText('Target: 0c', 12, 10);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('+30c', 12, mapY(30) + 2);
    ctx.fillText('-30c', 12, mapY(-30) + 2);

    if (!points.length) return;

    // Use last ~6s window (points are already trimmed, but keep it robust)
    const t1 = points[points.length - 1].t;
    const t0 = Math.max(points[0].t, t1 - 6000);
    const span = Math.max(1, t1 - t0);

    const mapX = (t: number) => ((t - t0) / span) * width;

    // Draw segmented polyline with grade-based colors
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let prev: TimelinePoint | null = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.t < t0) continue;
      if (p.confidence < 0.8) {
        prev = null;
        continue;
      }

      const abs = Math.abs(p.cents);
      const g = gradeFromCents(abs);
      ctx.strokeStyle = colorForGrade(g);

      const x = mapX(p.t);
      const y = mapY(p.cents);

      // Start a new segment if there was a confidence gap
      if (!prev) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        prev = p;
        continue;
      }

      // If grade changed a lot, cut the segment to keep colors meaningful
      const prevG = gradeFromCents(Math.abs(prev.cents));
      if (prevG !== g) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mapX(prev.t), mapY(prev.cents));
      }

      ctx.lineTo(x, y);
      prev = p;
    }
    ctx.stroke();

    // Sparse dots for readability
    ctx.globalAlpha = 0.6;
    const step = Math.max(1, Math.floor(points.length / 40));
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
      if (p.t < t0) continue;
      if (p.confidence < 0.8) continue;
      const x = mapX(p.t);
      const y = mapY(p.cents);
      const g = gradeFromCents(Math.abs(p.cents));
      ctx.fillStyle = colorForGrade(g);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Legend (top-right)
    const legend = '⭐±5  ⭐⭐±15  ⭐⭐⭐±30';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText(legend, width - 12, 10);
    ctx.textAlign = 'left';
  }, [points, height, targetNote]);

  return (
    <div style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          borderRadius: 16,
          background: 'rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      />
    </div>
  );
}
