import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MiniVocalGame from "./MiniVocalGame";
import IntroScreen from "./components/IntroScreen";
import HomeScreen from "./components/HomeScreen";
import { AuthPanel } from "./components/AuthPanel";
import { LeaderboardTable } from "./components/LeaderboardTable";

type User = { id: string; name?: string; email?: string; avatar?: string; provider?: string };
type Screen = "intro" | "home" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [user, setUser] = useState<User | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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

  const openLeaderboard = () => {
    setShowLeaderboard(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(".bottomArea");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goHome = () => {
    setShowLeaderboard(false);
    setScreen("home");
    window.scrollTo({ top: 0 });
  };

  const goGame = () => {
    setShowLeaderboard(false);
    setScreen("game");
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="appShell">
      <div className="topArea">
        <AuthPanel user={user} onUser={setUser} />
      </div>

      <div className="screenWrap">
        <AnimatePresence mode="wait">
          {screen === "intro" ? (
            <motion.div
              key="intro"
              className="screenInner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <IntroScreen onDone={goHome} />
            </motion.div>
          ) : screen === "home" ? (
            <motion.div
              key="home"
              className="screenInner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <HomeScreen onStart={goGame} onLeaderboard={openLeaderboard} />
            </motion.div>
          ) : (
            <motion.div
              key="game"
              className="screenInner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
            >
              <MiniVocalGame user={user} onSubmitScore={submitScore} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showLeaderboard ? (
        <div className="bottomArea">
          <LeaderboardTable currentUserId={user?.id} />
        </div>
      ) : null}
    </div>
  );
}
