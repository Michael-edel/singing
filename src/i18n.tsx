import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Lang = "ru" | "en";

type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = {
  ru: {
    // Global
    "lang.ru": "Русский",
    "lang.en": "English",

    // Auth
    "auth.title": "Войдите, чтобы попасть в таблицу участников",
    "auth.providers": "Google / Apple",
    "auth.user": "Пользователь",
    "auth.logout": "Выйти",
    "auth.apple": " Войти с Apple",
    "auth.google": "Войти через Google",
    "auth.google_missing": "Google вход не настроен",
    "auth.loading": "Загрузка...",
    "auth.apple_missing": "Apple вход: задайте APPLE_CLIENT_ID и APPLE_REDIRECT_URI",
    "auth.apple.missing": "Apple вход: задайте VITE_APPLE_CLIENT_ID и VITE_APPLE_REDIRECT_URI",
    "auth.apple.sdk": "AppleID SDK ещё не загрузился. Попробуйте снова.",
    "auth.apple.failed": "Вход Apple отменён или завершился ошибкой.",

    // Splash
    "splash.subtitle": "Премиум pitch‑челлендж — пой, попадай в ноту и делись результатом.",
    "splash.start": "Старт",
    "splash.starting": "Запуск…",
    "splash.tap": "Нажмите «Старт», чтобы включить микрофон (на iPhone требуется нажатие).",
    "splash.share.supported": "Поделиться поддерживается.",
    "splash.share.fallback": "Если нужно — текст будет скопирован.",
    "splash.mic.denied": "Доступ к микрофону отклонён.",
    "splash.footer": "Совет: используйте наушники для лучшей точности.",

    // Leaderboard
    "lb.title": "Участники",
    "lb.player": "Игрок",
    "lb.refresh": "Обновить",
    "lb.loading": "Загрузка…",
    "lb.best": "Лучший",
    "lb.anon": "Аноним",
    "lb.empty": "Пока нет результатов. Будь первым 🎤",

    // Game HUD
    "hud.live": "Сейчас",
    "hud.target": "Цель",
    "hud.delta": "Δ",
    "hud.liveScore": "Текущий score",
    "hud.streak": "Серия",
    "hud.confidence": "Уверенность",

    // Components
    "pitch.cents": "центов",
    "pitch.nice": "Отлично!",
    "pitch.tune": "Подстрой",
    "score.label": "Score",
    "menu.start": "Старт",
    "menu.leaderboard": "Таблица",
    "menu.tip": "Совет: используйте наушники для лучшей точности.",
    "menu.tagline": "Вокальный pitch-челлендж",
    "menu.continue": "Продолжить",
  },
  en: {
    "lang.ru": "Русский",
    "lang.en": "English",

    "auth.title": "Sign in to appear in the leaderboard",
    "auth.providers": "Google / Apple",
    "auth.user": "User",
    "auth.logout": "Logout",
    "auth.apple": " Sign in with Apple",
    "auth.google": "Sign in with Google",
    "auth.google_missing": "Google login not configured",
    "auth.loading": "Loading...",
    "auth.apple_missing": "Apple login: set APPLE_CLIENT_ID and APPLE_REDIRECT_URI",
    "auth.apple.missing": "Apple login: set VITE_APPLE_CLIENT_ID and VITE_APPLE_REDIRECT_URI",
    "auth.apple.sdk": "AppleID SDK not loaded yet. Try again.",
    "auth.apple.failed": "Apple sign-in cancelled or failed.",

    "splash.subtitle": "Premium pitch challenge — sing, stay on note, share your score.",
    "splash.start": "Start",
    "splash.starting": "Starting…",
    "splash.tap": "Tap Start to enable mic (iPhone requires a tap).",
    "splash.share.supported": "Share is supported.",
    "splash.share.fallback": "Share will copy text if needed.",
    "splash.mic.denied": "Microphone permission was denied.",
    "splash.footer": "Tip: use headphones for best accuracy.",

    "lb.title": "Participants",
    "lb.player": "Player",
    "lb.refresh": "Refresh",
    "lb.loading": "Loading…",
    "lb.best": "Best",
    "lb.anon": "Anonymous",
    "lb.empty": "No scores yet. Be the first 🎤",

    "hud.live": "Live",
    "hud.target": "Target",
    "hud.delta": "Δ",
    "hud.liveScore": "Live score",
    "hud.streak": "Streak",
    "hud.confidence": "Confidence",

    "pitch.cents": "cents",
    "pitch.nice": "Nice!",
    "pitch.tune": "Tune it",
    "score.label": "Score",
    "menu.start": "Start",
    "menu.leaderboard": "Leaderboard",
    "menu.tip": "Tip: use headphones for best accuracy.",
    "menu.tagline": "Vocal pitch challenge",
    "menu.continue": "Continue",
  },
};

const STORAGE_KEY = "mv_lang";

function normalizeLang(v: any): Lang {
  return v === "en" ? "en" : "ru";
}

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return normalizeLang(localStorage.getItem(STORAGE_KEY));
    } catch {
      return "ru";
    }
  });

  const setLang = useCallback((l: Lang) => {
    const next = normalizeLang(l);
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string) => {
      const dict = DICTS[lang];
      return dict[key] ?? DICTS.ru[key] ?? key;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
