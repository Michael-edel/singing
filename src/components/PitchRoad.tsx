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
  targetFreq?: number;
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

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function hzToMidi(freq: number) {
  return 69 + 12 * Math.log2(freq / 440);
}

function noteNameForMidi(midi: number) {
  const rounded = Math.round(midi);
  const note = noteNames[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

export default function PitchRoad({ points, windowMs = 4500, targetFreq = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const normalized = useMemo(() => {
    if (!points.length) return [] as PitchPoint[];
    const end = points[points.length - 1].t;
    const start = end - windowMs;
    return points
      .filter((p) => p.t >= start)
      .map((p) => ({ ...p, cents: Math.max(-400, Math.min(400, p.cents)) }));
  }, [points, windowMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const cssWidth = Math.max(280, Math.round(rect.width || 720));
    const cssHeight = Math.max(128, Math.round(rect.height || 168));
    if (canvas.width !== cssWidth * dpr || canvas.height !== cssHeight * dpr) {
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssWidth;
    const h = cssHeight;
    ctx.clearRect(0, 0, w, h);

    const targetMidi = Math.round(hzToMidi(targetFreq));
    const gridMidis: number[] = [];
    for (let i = -4; i <= 4; i += 1) gridMidis.push(targetMidi + i);

    const midiToY = (midi: number) => {
      const topMidi = targetMidi + 4;
      const bottomMidi = targetMidi - 4;
      const ratio = (topMidi - midi) / (topMidi - bottomMidi || 1);
      return 12 + ratio * (h - 24);
    };

    const centsToY = (cents: number) => midiToY(targetMidi + cents / 100);

    ctx.font = "500 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    gridMidis.forEach((midi) => {
      const y = midiToY(midi);
      const isTarget = midi === targetMidi;
      ctx.strokeStyle = isTarget ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.12)";
      ctx.lineWidth = isTarget ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = isTarget ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.48)";
      ctx.fillText(noteNameForMidi(midi), 8, y - 10);
    });

    if (!normalized.length) {
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Спойте ноту, чтобы увидеть дорожку", w / 2, h / 2 + 5);
      return;
    }

    const endT = normalized[normalized.length - 1].t;
    const startT = endT - windowMs;
    const xForT = (t: number) => Math.max(8, Math.min(w - 8, ((t - startT) / windowMs) * w));

    if (normalized.length < 2) {
      const only = normalized[0];
      const c = colorFor(only.grade);
      ctx.fillStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(xForT(only.t), centsToY(only.cents), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < normalized.length; i += 1) {
      const a = normalized[i - 1];
      const b = normalized[i];
      if (b.t - a.t > 350) continue;
      const c = colorFor(b.grade);
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(xForT(a.t), centsToY(a.cents));
      ctx.lineTo(xForT(b.t), centsToY(b.cents));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const last = normalized[normalized.length - 1];
    const lastColor = colorFor(last.grade);
    ctx.fillStyle = lastColor;
    ctx.shadowColor = lastColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(xForT(last.t), centsToY(last.cents), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [normalized, targetFreq, windowMs]);

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
