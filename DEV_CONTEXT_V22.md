# 🎤 MiniVocalGame — DEV CONTEXT (V22)

## Project

**MiniVocalGame — Vocal Pitch Challenge**

Веб-игра, где пользователь поёт ноту в микрофон, а система определяет точность попадания.

Используется как:

- 🎤 вокальный тренажёр
- 🎮 музыкальная мини-игра
- 📱 social challenge
- 🎵 демонстрация pitch detection

---

## 🌐 Production

https://singing.mikhaileirich.workers.dev

---

## ⚙️ Tech Stack

Frontend:

- React
- TypeScript
- Vite
- Framer Motion
- Web Audio API
- Canvas API

Backend:

- Cloudflare Workers
- Cloudflare D1 (SQLite)
- OAuth login

---

## 📁 Project Structure

```
singing
│
├─ cloudflare
│   └─ worker.js
│
├─ migrations
│   └─ 0001_init.sql
│
├─ public
│   ├─ logo_dark.png
│   └─ logo_intro.mp4
│
├─ src
│   ├─ components
│   │   ├─ AccuracyRing.tsx
│   │   ├─ AuthPanel.tsx
│   │   ├─ DailyChallenge.tsx
│   │   ├─ GameMenu.tsx
│   │   ├─ GlowButton.tsx
│   │   ├─ HomeScreen.tsx
│   │   ├─ IntroScreen.tsx
│   │   ├─ LeaderboardTable.tsx
│   │   ├─ PitchRingSmule.tsx
│   │   ├─ PitchRoad.tsx
│   │   ├─ PitchTimeline.tsx
│   │   └─ ScoreMeter.tsx
│   │
│   ├─ MiniVocalGame.tsx
│   ├─ SplashScreen.tsx
│   ├─ App.tsx
│   ├─ i18n.tsx
│   ├─ styles.css
│   └─ main.tsx
│
├─ package.json
└─ wrangler.toml
```

---

## 🎤 Audio Pipeline

```
Microphone
↓ getUserMedia
AudioContext
↓
AnalyserNode
↓
Float32Array buffer
↓
Pitch detection
↓
frequency
↓
cents error
↓
accuracy
↓
score
```

Game loop: `requestAnimationFrame`

---

## 🎮 Game Settings (as in code)

- `TOTAL_ROUNDS = 5`
- `ROUND_MS = 2500`
- `CALIBRATION_MS = 6000`
- `SILENCE_AUTOPAUSE_MS = 1000`

Stages:

- `setup`
- `calibration`
- `game`
- `results`

Difficulty:

- `newbie`
- `pro`

Calibration:

- `low` → `high` → `done`

---

## 🎼 Notes

Reference: `A4 = 440 Hz`

Example notes:

- C4 261.63
- D4 293.66
- E4 329.63
- F4 349.23
- G4 392.00
- A4 440.00
- B4 493.88

---

## 🎯 Cents Calculation

```
cents = 1200 * log2(freq / targetFreq)
```

---

## 🎯 Accuracy + Rating

Hit windows (cents):

- `perfect < 5`
- `great < 15`
- `good < 30`
- `bad >= 30`

Star feedback:

- perfect → ⭐⭐⭐⭐⭐
- great   → ⭐⭐⭐⭐
- good    → ⭐⭐⭐
- bad     → ⭐⭐

---

## 🏆 Score System

Score range: `0 – 100`

---

## 🌍 Localization

Languages:

- RU
- KZ
- EN
- DE

File: `src/i18n.tsx`

Language stored in `localStorage`.

---

## 🔐 Authentication

Supported:

- Google OAuth
- Apple Sign-In

Flow:

```
Frontend
↓
OAuth provider
↓
ID token
↓
Cloudflare Worker verifies token
↓
User saved in D1
↓
Session cookie
```

---

## 🌐 API

Leaderboard:

- `GET /api/leaderboard`

Submit score:

- `POST /api/score`

Auth:

- `POST /api/auth/google`
- `POST /api/auth/apple`

---

## 🗄 Database (Cloudflare D1)

### users

- id
- email
- name
- avatar
- provider
- created_at

### scores

- id
- user_id
- score
- accuracy
- created_at

---

## 📈 LocalStorage Keys

- `mini-vocal-history`
- `mini-vocal-streak`
- `mini-vocal-weekly-board`

---

## 🚀 Deploy

Build:

```
npm run build
```

Deploy:

```
npx wrangler deploy
```

---

## Development Rules

When writing code:

- use TypeScript
- keep components modular
- avoid allocations in audio loop
- use requestAnimationFrame
- optimize latency
- maintain 60fps UI

AI instructions:

- do not change architecture without reason
- focus on UX clarity
- optimize pitch detection performance
- prefer small modular components
