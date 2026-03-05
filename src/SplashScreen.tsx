import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GlowButton } from "./components/GlowButton";

type Props = {
  onStart: () => Promise<void> | void;
  statusText?: string;
};

export default function SplashScreen({ onStart, statusText }: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string>("");

  const handleStart = async () => {
    try {
      setBusy(true);
      setHint("");
      await onStart();
    } catch (e: any) {
      setHint(e?.message ? String(e.message) : "Microphone permission was denied.");
      setBusy(false);
    }
  };

  const canShare = useMemo(() => typeof navigator !== "undefined" && !!(navigator as any).share, []);

  return (
    <div className="v5Shell">
      <div className="v5Backdrop" aria-hidden />
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
          <p className="v5Subtitle">Premium pitch challenge — sing, stay on note, share your score.</p>
        </div>

        <div className="v5Actions">
          <button className="v5PrimaryBtn" onClick={handleStart} disabled={busy}>
            {busy ? "Starting…" : "Start"}
          </button>
          <div className="v5Meta">
            <span className="v5Dot" />
            {statusText ? statusText : "Tap Start to enable mic (iPhone requires a tap)."}{" "}
            {canShare ? "Share is supported." : "Share will copy text if needed."}
          </div>
        </div>

        {hint ? <div className="v5Hint">{hint}</div> : null}

        <div className="v5Footer">
          <span>Tip:</span> use headphones for best accuracy.
        </div>
      </motion.div>
    </div>
  );
}
