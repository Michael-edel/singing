import type { ReactNode } from "react";
import { useI18n } from "../i18n";

type Props = {
  liveHz: number;
  target: string;
  stars: number;
  confidence: number;
  streak: number;
  stable: boolean;
};

export default function HUDPanel({ liveHz, target, stars, confidence, streak, stable }: Props) {
  const { t } = useI18n();

  return (
    <div className="hudPanelV2">
      <Stat label={t('hud.live')} value={`${Math.round(liveHz) || 0} Hz`} />
      <Stat label={t('hud.target')} value={target} />
      <Stat label={t('hud.stars')} value={<span className="hudStarsFixed">{Array.from({ length: 5 }, (_, i) => <span key={i} className={i < stars ? 'star star--on' : 'star'}>{i < stars ? '★' : '☆'}</span>)}</span>} />
      <Stat label={t('hud.confidence')} value={`${Math.round(confidence * 100)}%`} />
      <Stat label={t('hud.streak')} value={String(streak)} />
      <Stat label="Lock" value={stable ? 'ON' : '—'} accent={stable} />
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={`statCardV2 ${accent ? 'statCardV2--accent' : ''}`}>
      <div className="statCardV2__label">{label}</div>
      <div className="statCardV2__value">{value}</div>
    </div>
  );
}
