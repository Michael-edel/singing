import { useEffect, useRef } from 'react';

export function useMicrophone(onFrame: (data: Float32Array) => void) {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (cancelled) return;
      ctx = new AudioContext();
      source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buffer = new Float32Array(analyser.fftSize);

      const loop = () => {
        if (!analyserRef.current || cancelled) return;
        analyserRef.current.getFloatTimeDomainData(buffer);
        onFrame(buffer);
        rafRef.current = requestAnimationFrame(loop);
      };

      loop();
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source?.disconnect();
      analyserRef.current?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void ctx?.close();
    };
  }, [onFrame]);
}
