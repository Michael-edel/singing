import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MiniVocalGame from "./MiniVocalGame";
import SplashScreen from "./SplashScreen";
import GameMenu from "./components/GameMenu";
import { AuthPanel } from "./components/AuthPanel";
import { LeaderboardTable } from "./components/LeaderboardTable";

type User = {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  provider?: string;
};

type Screen = "splash" | "menu" | "game";

export default function App() {

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

        {screen === "splash" && (
          <SplashScreen onFinish={() => setScreen("menu")} />
        )}

        {screen === "menu" && (
          <GameMenu
            onStart={() => setScreen("game")}
            onLeaderboard={() => {
              document
                .querySelector(".bottomArea")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        )}

        {screen === "game" && (
          <MiniVocalGame
            user={user}
            onSubmitScore={submitScore}
          />
        )}

      </AnimatePresence>

      <div className="bottomArea">
        <LeaderboardTable currentUserId={user?.id} />
      </div>

    </div>
  );
}