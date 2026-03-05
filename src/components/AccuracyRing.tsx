import { motion } from "framer-motion";
import { useI18n } from "../i18n";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * cents in [-50..+50] where 0 means perfect. Outside gets clamped.
 */
export function AccuracyRing({ cents }: { cents: number }) {
  const { t: tr } = useI18n();
  const c = clamp(cents, -50, 50);
  const prog = (c + 50) / 100; // 0..1
  const angle = -120 + prog * 240;
  const good = Math.abs(c) <= 10;

  return (
    <div className="ringWrap" aria-label="Pitch accuracy">
      <div className="ringBg" />
      <motion.div
        className="ringNeedle"
        animate={{ rotate: angle, scale: good ? 1.03 : 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 18 }}
      />
      <motion.div
        className="ringPulse"
        animate={{
          opacity: good ? [0.18, 0.55, 0.18] : 0.12,
          scale: good ? [1, 1.06, 1] : 1,
        }}
        transition={{ duration: 1.05, repeat: good ? Infinity : 0, ease: "easeInOut" }}
      />
      <div className="ringText">
        <div className="cents">{Math.round(c)} {tr("pitch.cents")}</div>
        <div className="label">{good ? tr("pitch.nice") : tr("pitch.tune")}</div>
      </div>
    </div>
  );
}
