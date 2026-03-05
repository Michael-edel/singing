import { motion } from "framer-motion";
import { useI18n } from "../i18n";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}


function centsToStars(cents: number): number {
  const a = Math.abs(cents);
  if (a < 5) return 5;
  if (a < 15) return 4;
  if (a < 30) return 3;
  if (a < 50) return 2;
  return 1;
}

/**
 * Smule-style pitch ring.
 * cents: [-50..+50] ideally. Values outside are clamped for display.
 * confidence: 0..1 (optional) affects glow intensity.
 */
export function PitchRingSmule({
  cents,
  note,
  hz,
  confidence = 0.8,
}: {
  cents: number;
  note: string;
  hz: number;
  confidence?: number;
}) {
  const { t: tr } = useI18n();
  const c = clamp(cents, -50, 50);
  const prog = (c + 50) / 100; // 0..1
  const angle = -120 + prog * 240; // -120..+120
  const good = Math.abs(c) <= 10;
  const glow = clamp(confidence, 0, 1) * (good ? 1 : 0.6);

  return (
    <div className="smuleRing" aria-label="Pitch ring">
      <div className="smuleRingOuter" />
      <div className="smuleRingInner" />

      <motion.div
        className="smuleDot"
        animate={{ rotate: angle }}
        transition={{ type: "spring", stiffness: 170, damping: 18 }}
        style={{ ["--glow" as any]: glow }}
      >
        <div className="smuleDotPoint" />
      </motion.div>

      <motion.div
        className="smuleCenter"
        animate={{ scale: good ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 16 }}
      >
        <div className="smuleNote">{note}</div>
        <div className="smuleHz">{Math.round(hz)} Hz</div>
        <div className="smuleCents">{"⭐".repeat(centsToStars(c))}</div>
      </motion.div>

      <motion.div
        className="smulePulse"
        animate={
          good
            ? { opacity: [0.16, 0.45, 0.16], scale: [1, 1.06, 1] }
            : { opacity: 0.12, scale: 1 }
        }
        transition={{ duration: 1.1, repeat: good ? Infinity : 0, ease: "easeInOut" }}
      />
    </div>
  );
}