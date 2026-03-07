import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "../i18n";

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
      return "#22c55e";
    case "great":
      return "#facc15";
    case "good":
      return "#60a5fa";
    default:
      return "#ef4444";
  }
};

export default function PitchRoad({ points, windowMs = 3800 }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalized = useMemo(() => {
    if (!points.length) return [] as PitchPoint[];
    const end = points[points.length - 1].t;
    const start = end - windowMs;
    return points.filter((p) => p.t >= start).map((p) => ({ ...p, cents: Math.max(-70, Math.min(70, p.cents)) }));
  }, [points, windowMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(280, Math.round(rect.width || 720));
    const cssHeight = Math.max(96, Math.round(rect.height || 132));
    if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
      canvas.width = cssWidth;
      canvas.height = cssHeight;
    }

    const w = cssWidth;
    const h = cssHeight;
    const mid = h / 2;
    const centsToY = (c: number) => mid - c * (h / 160);

    ctx.clearRect(0, 0, w, h);

    // background guide bands
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    [10, 25, 45].forEach((band) => {
      [band, -band].forEach((c) => {
        ctx.beginPath();
        ctx.moveTo(0, centsToY(c));
        ctx.lineTo(w, centsToY(c));
        ctx.stroke();
      });
    });

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    if (!normalized.length) {
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("pitch.roadHint") || "Sing to see the pitch road", w / 2, mid + 5);
      return;
    }

    const endT = normalized[normalized.length - 1].t;
    const startT = endT - windowMs;
    const xForT = (t: number) => Math.max(6, Math.min(w - 6, ((t - startT) / windowMs) * w));

    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < normalized.length; i += 1) {
      const a = normalized[i - 1];
      const b = normalized[i];
      if (b.t - a.t > 320) continue;
      const color = colorFor(b.grade);
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(xForT(a.t), centsToY(a.cents));
      ctx.lineTo(xForT(b.t), centsToY(b.cents));
      ctx.stroke();
    }

    const last = normalized[normalized.length - 1];
    const lastColor = colorFor(last.grade);
    ctx.shadowColor = lastColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = lastColor;
    ctx.beginPath();
    ctx.arc(xForT(last.t), centsToY(last.cents), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [normalized, t, windowMs]);

  return (
    <div className="pitchRoadWrap pitchRoadWrapV2">
      <canvas ref={canvasRef} className="pitchRoad pitchRoadV2" />
      <div className="pitchRoadLegend" aria-hidden>
        <span>● {t('pitch.legendPerfect') || 'perfect'}</span>
        <span>● {t('pitch.legendGreat') || 'great'}</span>
        <span>● {t('pitch.legendGood') || 'good'}</span>
        <span>● {t('pitch.legendMiss') || 'miss'}</span>
      </div>
    </div>
  );
}
