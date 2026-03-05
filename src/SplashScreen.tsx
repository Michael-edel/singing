import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "./i18n";

type Props = {
  onStart: () => Promise<void> | void;
  statusText?: string;
};

export default function SplashScreen({ onStart, statusText }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string>("");
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  const handleStart = async () => {
    try {
      setBusy(true);
      setHint("");
      await onStart();
    } catch (e: any) {
      setHint(e?.message ? String(e.message) : t("splash.mic.denied"));
      setBusy(false);
    }
  };

  const canShare = useMemo(() => typeof navigator !== "undefined" && !!(navigator as any).share, []);

  return (
    <div className="v5Shell">
      <div className="v5Backdrop" aria-hidden />

      {showIntro ? (
        <button
          className="introOverlay"
          onClick={() => setShowIntro(false)}
          aria-label="Skip intro"
          type="button"
        >
          <video className="introVideo" autoPlay muted playsInline>
            <source src="/logo_intro.mp4" type="video/mp4" />
          </video>
        </button>
      ) : null}

      <motion.div className="v5Card"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <div className="v5LogoWrap">
          <motion.img className="v5Logo" src="/logo_dark.png" alt="Jivoi Zvuk vocal studio"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: [0.98, 1.02, 0.98] }}
            transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="v5TitleBlock">
          <div className="v5Kicker">Jivoi Zvuk</div>
          <h1 className="v5Title">MiniVocalGame</h1>
          <p className="v5Subtitle">{t("splash.subtitle")}</p>
        </div>

        <div className="v5Actions">
          <button className="v5PrimaryBtn" onClick={handleStart} disabled={busy}>
            {busy ? t("splash.starting") : t("splash.start")}
          </button>
          <div className="v5Meta">
            <span className="v5Dot" />
            {statusText ? statusText : t("splash.tap")}{" "}
            {canShare ? t("splash.share.supported") : t("splash.share.fallback")}
          </div>
        </div>

        {hint ? <div className="v5Hint">{hint}</div> : null}

        <div className="v5Footer">
          {t("splash.footer")}
        </div>
      </motion.div>
    </div>
  );
}
