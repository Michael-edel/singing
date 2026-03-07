import { useEffect } from "react";
import { motion } from "framer-motion";
import { useI18n } from "../i18n";

type Props = { onDone: () => void };

export default function IntroScreen({ onDone }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    const t = window.setTimeout(onDone, 1800);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <motion.button
      type="button"
      className="introOverlay"
      onClick={onDone}
      aria-label={t("intro.skip")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="introCard"
        initial={{ scale: 0.96, opacity: 0.7 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45 }}
      >
        <div className="introKicker">{t("intro.kicker")}</div>
        <div className="introTitle">MiniVocalGame</div>
        <div className="introSub">{t("intro.subtitle")}</div>
      </motion.div>
    </motion.button>
  );
}
