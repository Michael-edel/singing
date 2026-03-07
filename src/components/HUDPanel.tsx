import type { ReactNode } from "react";
import { useI18n } from "../i18n";

function Stars({ value }: { value: number }) {
  return (
    <div className="hudStars" aria-label={`stars-${value}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < value ? "hudStar hudStar--on" : "hudStar"}>
          {i < value ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}

function StatCard({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`statCard ${wide ? "statCard--wide" : ""}`.trim()}>
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

export default function HUDPanel({
  liveHz,
  targetNote,
  stars,
  confidence,
  streak,
}: {
  liveHz: number;
  targetNote: string;
  stars: number;
  confidence: number;
  streak: number;
}) {
  const { t } = useI18n();

  return (
    <div className="hudGridV2">
      <StatCard label={t("hud.live")} value={`${Math.round(liveHz) || 0} Hz`} />
      <StatCard label={t("hud.target")} value={targetNote} />
      <StatCard label={t("hud.stars")} value={<Stars value={stars} />} />
      <StatCard label={t("hud.confidence")} value={`${Math.round(confidence * 100)}%`} />
      <StatCard label={t("hud.streak")} value={streak} wide />
    </div>
  );
}
