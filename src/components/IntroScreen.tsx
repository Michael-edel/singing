import { useEffect } from "react";
import { motion } from "framer-motion";

type Props = { onDone: () => void };

export default function IntroScreen({ onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.button
      type="button"
      className="introOverlay"
      onClick={onDone}
      aria-label="Skip intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <video className="introVideo" autoPlay muted playsInline preload="auto">
        <source src="/logo_intro.mp4" type="video/mp4" />
      </video>
    </motion.button>
  );
}
