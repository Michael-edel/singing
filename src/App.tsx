import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MiniVocalGame from "./MiniVocalGame";
import IntroScreen from "./components/IntroScreen";
import HomeScreen from "./components/HomeScreen";
import { AuthPanel } from "./components/AuthPanel";
import { LeaderboardTable } from "./components/LeaderboardTable";

type User = { id: string; name?: string; email?: string; avatar?: string; provider?: string };

export default function App() {
  type Screen = "intro" | "home" | "game";
  const [screen, setScreen] = useState<Screen>("intro");
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
    <div className={`appShell appShell--${screen}`}>
      {screen === "home" ? (
        <div className="topArea">
          <AuthPanel user={user} onUser={setUser} />
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {screen === "intro" ? (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <IntroScreen onDone={() => setScreen("home")} />
          </motion.div>
        ) : screen === "home" ? (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
          >
            <HomeScreen
              onStart={() => setScreen("game")}
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

      {screen !== "game" ? (
        <div className="bottomArea">
          <LeaderboardTable currentUserId={user?.id} />
        </div>
      ) : null}
    </div>
  );
}
