import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "./i18n";

type Props = {
  onFinish: () => void;
};

export default function SplashScreen({ onFinish }: Props) {
  const { t } = useI18n();
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false);
      onFinish();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  const skip = () => {
    setShowIntro(false);
    onFinish();
  };

  return (
    <div className="splashShell">
      <div className="splashBackdrop" aria-hidden />
      {showIntro ? (
        <button className="introOverlay" onClick={skip} aria-label="Skip intro" type="button">
          <video className="introVideo" autoPlay muted playsInline>
            <source src="/logo_intro.mp4" type="video/mp4" />
          </video>
        </button>
      ) : null}

      <motion.div
        className="splashCard"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <img className="splashMark" src="/logo_dark.png" alt="Jivoi Zvuk" />
        <div className="splashText">
          <div className="splashTitle">MiniVocalGame</div>
          <div className="splashSubtitle">{t("splash.subtitle")}</div>
        </div>
        <button className="splashContinue" onClick={skip} type="button">
          {t("menu.continue")}
        </button>
      </motion.div>
    </div>
  );
}
