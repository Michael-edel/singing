export type ReferenceToneHandle = {
  stop: () => void;
};

export function playReferenceTone(
  audioContext: AudioContext,
  hz: number,
  durationMs = 900,
  gain = 0.08
): ReferenceToneHandle {
  const osc = audioContext.createOscillator();
  const g = audioContext.createGain();
  let stopped = false;

  osc.type = 'sine';
  osc.frequency.value = hz;

  const now = audioContext.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.02);

  osc.connect(g);
  g.connect(audioContext.destination);
  osc.start();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      const t = audioContext.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.stop(t + 0.06);
    } catch {
      try { osc.stop(); } catch {}
    }
    window.setTimeout(() => {
      try { osc.disconnect(); } catch {}
      try { g.disconnect(); } catch {}
    }, 100);
  };

  window.setTimeout(stop, durationMs);
  return { stop };
}
