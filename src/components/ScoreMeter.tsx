import { motion } from "framer-motion";
import { useI18n } from "../i18n";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function ScoreMeter({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label?: string;
}) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t("score.label");
  const pct = clamp(value / max, 0, 1);

  return (
    <div className="scoreMeter" aria-label={resolvedLabel}>
      <div className="scoreMeterTop">
        <span className="scoreMeterLabel">{resolvedLabel}</span>
        <span className="scoreMeterValue">{Math.round(value)}</span>
      </div>
      <div className="scoreMeterTrack">
        <motion.div
          className="scoreMeterFill"
          animate={{ scaleX: pct }}
          transition={{ type: "spring", stiffness: 160, damping: 22 }}
          style={{ transformOrigin: "0% 50%" }}
        />
      </div>
    </div>
  );
}
