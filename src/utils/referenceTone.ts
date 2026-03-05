export type ReferenceToneHandle = {
  stop: () => void;
};

/**
 * Play a reference sine tone for a target frequency.
 * Keep this utility stateless; caller controls lifecycle.
 */
export function playReferenceTone(
  audioContext: AudioContext,
  hz: number,
  durationMs = 900,
  gain = 0.08
): ReferenceToneHandle {
  const osc = audioContext.createOscillator();
  const g = audioContext.createGain();

  osc.type = 'sine';
  osc.frequency.value = hz;

  const now = audioContext.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.02);
  g.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

  osc.connect(g);
  g.connect(audioContext.destination);

  osc.start();

  const stop = () => {
    try {
      osc.stop();
    } catch {
      // ignore
    }
    osc.disconnect();
    g.disconnect();
  };

  // Auto-stop
  window.setTimeout(stop, durationMs + 50);

  return { stop };
}
