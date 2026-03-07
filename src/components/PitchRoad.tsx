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
      return "#06b6d4";
    case "good":
      return "#facc15";
    default:
      return "#ef4444";
  }
};

export default function PitchRoad({ points, windowMs = 4000 }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalized = useMemo(() => {
    if (!points.length) return [] as PitchPoint[];
    const end = points[points.length - 1].t;
    const start = end - windowMs;
    return points
      .filter((p) => p.t >= start)
      .map((p) => ({ ...p, cents: Math.max(-60, Math.min(60, p.cents)) }));
  }, [points, windowMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.max(280, Math.round(rect.width || 720));
    const cssHeight = Math.max(110, Math.round(rect.height || 150));
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    const gradBg = ctx.createLinearGradient(0, 0, 0, h);
    gradBg.addColorStop(0, "rgba(255,255,255,0.08)");
    gradBg.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = gradBg;
    ctx.fillRect(0, 0, w, h);

    const mid = h / 2;
    const centsToY = (c: number) => mid - c * (h / 145);

    for (const band of [0, 10, 30, 50]) {
      const alpha = band === 0 ? 0.34 : band === 10 ? 0.22 : 0.12;
      const yTop = centsToY(band);
      const yBottom = centsToY(-band);
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = band === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(10, yTop);
      ctx.lineTo(w - 10, yTop);
      ctx.stroke();
      if (band !== 0) {
        ctx.beginPath();
        ctx.moveTo(10, yBottom);
        ctx.lineTo(w - 10, yBottom);
        ctx.stroke();
      }
    }

    const endT = normalized.length ? normalized[normalized.length - 1].t : performance.now();
    const startT = endT - windowMs;
    const xForT = (t: number) => Math.max(10, Math.min(w - 10, ((t - startT) / windowMs) * (w - 20) + 10));

    if (!normalized.length) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t("pitch.roadEmpty") || "Sing to see your pitch road", w / 2, mid + 4);
      return;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < normalized.length; i += 1) {
      const a = normalized[i - 1];
      const b = normalized[i];
      if (b.t - a.t > 320) continue;
      const color = colorFor(b.grade);
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(xForT(a.t), centsToY(a.cents));
      ctx.lineTo(xForT(b.t), centsToY(b.cents));
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.20)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xForT(a.t), centsToY(a.cents));
      ctx.lineTo(xForT(b.t), centsToY(b.cents));
      ctx.stroke();
    }

    const last = normalized[normalized.length - 1];
    const lastColor = colorFor(last.grade);
    ctx.fillStyle = lastColor;
    ctx.shadowColor = lastColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(xForT(last.t), centsToY(last.cents), 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [normalized, t, windowMs]);

  return (
    <div className="pitchRoadWrap pitchRoadWrap--v2">
      <canvas ref={canvasRef} className="pitchRoad pitchRoad--v2" />
      <div className="pitchRoadLegend" aria-hidden>
        <span>🟢 {t("pitch.perfect") || "Perfect"}</span>
        <span>🟡 {t("pitch.close") || "Close"}</span>
        <span>🔴 {t("pitch.off") || "Off"}</span>
      </div>
    </div>
  );
}
