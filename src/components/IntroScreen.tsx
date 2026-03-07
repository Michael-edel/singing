import { useEffect } from "react";
import { motion } from "framer-motion";

type Props = { onDone: () => void };

export default function IntroScreen({ onDone }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.button
      type="button"
      className="introOverlay introOverlay--video"
      onClick={onDone}
      aria-label="Skip intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <video className="introVideo" autoPlay muted playsInline>
        <source src="/logo_intro.mp4" type="video/mp4" />
      </video>
      <motion.div
        className="introCard introCard--video"
        initial={{ y: 16, opacity: 0.8 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <div className="introKicker">Vocal Pitch Challenge</div>
        <div className="introTitle">MiniVocalGame</div>
        <div className="introSub">Попади в ноту. Удержи звук. Забери лучший результат.</div>
      </motion.div>
    </motion.button>
  );
}
