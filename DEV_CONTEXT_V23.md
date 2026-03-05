# 🎤 MiniVocalGame — DEV CONTEXT (V23)

This is the **developer context** for the *MiniVocalGame — Vocal Pitch Challenge* project.
Use it as a drop-in context block for new chats / assistants.

## Current Version

V23

## What’s new in V23

- **Allocation-free pitch engine module**: `src/audio/PitchEngine.ts`
  - YIN (time-domain) pitch detection
  - internal buffer reuse for 60fps UI + low GC
  - EMA pitch smoothing + jump-aware smoothing
  - returns `{ hz, probability, rms }`
- (Utility) `src/utils/referenceTone.ts` (sine reference tone)

Everything else is the same as V22 (game loop, calibration, leaderboard, OAuth, UI).

## Tech Stack

Frontend: React, TypeScript, Vite, Framer Motion, Web Audio API, Canvas API  
Backend: Cloudflare Workers, Cloudflare D1 (SQLite), OAuth

## Audio Pipeline

Microphone → getUserMedia → AudioContext → AnalyserNode → Float32Array →
**PitchEngine (YIN)** → frequency → cents error → accuracy → score

Game loop: `requestAnimationFrame`

## Pitch Engine API

File: `src/audio/PitchEngine.ts`

```ts
const engine = new PitchEngine({
  sampleRate,
  bufferSize,      // analyser.fftSize
  minHz: 80,
  maxHz: 1000,
  threshold: 0.15,
  minProbability: 0.7,
  emaAlpha: 0.2,
});

const res = engine.process(buffer);
// res: { hz, probability, rms } | null
```

## Notes

A4 = 440 Hz  
cents = 1200 * log2(freq / targetFreq)

## Development Rules

- keep pitch detection allocation-free in the realtime loop
- prefer modular components
- use rAF for game loop
- keep UI at 60fps; minimize re-renders
