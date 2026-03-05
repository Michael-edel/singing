
# 🎤 MiniVocalGame
### Vocal Pitch Challenge by **Jivoi Zvuk**

Interactive web game that tests how accurately you can sing a musical note.

Users sing into the microphone, and the app analyzes the pitch in real time and evaluates vocal accuracy.

Designed for **mobile devices**, **Instagram challenges**, and **vocal training**.

---

# 🚀 Demo

Live version:  
https://singing.mikhailerich.workers.dev

---

# ✨ Features

## 🎤 Real-time pitch detection
The app analyzes the user's voice using **Web Audio API** and calculates the pitch frequency.

## 🎮 Vocal challenge gameplay
Users must hold a note and stay close to the target pitch.  
The closer the pitch, the higher the score.

## 📱 Mobile-first design
Optimized for:
- iPhone
- mobile browsers
- Instagram in-app browser

## 🎨 Premium UI (V5 PRO)

- dark studio interface
- animated splash screen
- glowing logo
- glass UI elements

## ⚡ Fast global deployment

Powered by:
- Cloudflare Workers
- global CDN

---

# 🧠 How it works

1. User opens the game  
2. Presses **Start**  
3. Allows microphone access  
4. Sings a note  
5. The system measures pitch accuracy  

The app calculates:

- frequency
- pitch
- accuracy
- score

---

# 🎯 Use cases

## Vocal schools
Use it as a fun **vocal accuracy test** for students.

## Instagram challenges
Create viral singing challenges in stories.

## Vocal training
Practice pitch accuracy and ear training.

## Music education
Demonstrate how pitch detection works.

---

# 🛠 Tech Stack

### Frontend
- React
- TypeScript
- Vite

### Audio Processing
- Web Audio API
- real-time pitch detection
- FFT analysis

### Deployment
- Cloudflare Workers
- Wrangler

---

# 📁 Project Structure

src
 ├── App.tsx
 ├── SplashScreen.tsx
 ├── MiniVocalGame.tsx
 ├── main.tsx
 └── styles.css

public
 └── logo_dark.png

---

# ⚙️ Installation

Clone the repository

git clone https://github.com/Michael-edel/singing.git

Enter project folder

cd singing

Install dependencies

npm install

Run development server

npm run dev

---

# 🏗 Build

npm run build

---

# 🚀 Deploy

npx wrangler deploy

---

# 📱 Mobile Usage

On **iPhone**:

1. open the link
2. press **Start**
3. allow microphone access
4. sing a note

iOS requires user interaction before microphone access.

---

# 🎮 Future roadmap

Planned features:

- Pitch target ring
- Score system
- Leaderboard
- Instagram share
- Vocal exercises
- Multiple difficulty levels

---

# 👨‍💻 Author

Michael Edel  
Jivoi Zvuk Vocal Studio

---

# ⭐ Support the project

If you like the project:

⭐ Star the repository  
🎤 Share the vocal challenge  
🚀 Contribute improvements


## V9 Auth + Leaderboard (Google/Apple)

### 1) Set Vite env vars (frontend)

Create `.env`:

- `VITE_GOOGLE_CLIENT_ID=...`
- `VITE_APPLE_CLIENT_ID=...` (Apple Service ID)
- `VITE_APPLE_REDIRECT_URI=https://YOUR_DOMAIN` (must match Apple config)

### 2) Configure Worker env vars (backend)

In `wrangler.toml` set:

- `SESSION_SECRET` (long random)
- `GOOGLE_CLIENT_ID`
- `APPLE_CLIENT_ID`

### 3) D1 database

Create D1 and set `database_id` in `wrangler.toml`, then run migrations:

```bash
npx wrangler d1 migrations apply singing-db --local
npx wrangler d1 migrations apply singing-db
```

### 4) Deploy

```bash
npm run build
npx wrangler deploy
```

API:
- `POST /api/login/google`
- `POST /api/login/apple`
- `GET /api/me`
- `POST /api/score`
- `GET /api/leaderboard`
