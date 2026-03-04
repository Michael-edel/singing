import React, { useEffect, useMemo, useRef, useState } from "react";

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
      <div className="v5Card">
        <div className="v5LogoWrap">
          <img className="v5Logo" src="/logo_dark.png" alt="Jivoi Zvuk vocal studio" />
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
      </div>
    </div>
  );
}
