import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MiniVocalGame from "./MiniVocalGame";
import SplashScreen from "./SplashScreen";
import { AuthPanel } from "./components/AuthPanel";
import { LeaderboardTable } from "./components/LeaderboardTable";
import GameMenu from "./components/GameMenu";

type User = { id: string; name?: string; email?: string; avatar?: string; provider?: string };

export default function App() {
  type Screen = "splash" | "menu" | "game";
  const [screen, setScreen] = useState<Screen>("splash");
  const [user, setUser] = useState<User | null>(null);

  async function submitScore(payload: { score: number; accuracy: number }) {
    try {
      await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    } catch {}
  }

  // keep user fresh after refresh
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();
        setUser(data.user ?? null);
      } catch {}
    })();
  }, []);

  return (
    <div className="appShell">
      <div className="topArea">
        <AuthPanel user={user} onUser={setUser} />
      </div>

      <AnimatePresence mode="wait">
        {screen === "splash" ? (
          <motion.div
            key="splash"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <SplashScreen onStart={() => setScreen("menu")} />
          </motion.div>
        ) : screen === "menu" ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <GameMenu
              onStart={() => setScreen("game")}
              onLeaderboard={() => {
                const el = document.querySelector(".bottomArea");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="game"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <MiniVocalGame user={user} onSubmitScore={submitScore} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bottomArea">
        <LeaderboardTable currentUserId={user?.id} />
      </div>
    </div>
  );
}
