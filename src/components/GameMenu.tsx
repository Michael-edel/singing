import { motion } from "framer-motion";

type Props = {
  onStart: () => void;
  onLeaderboard: () => void;
};

export default function GameMenu({ onStart, onLeaderboard }: Props) {
  return (
    <div className="menuShell">
      <div className="menuBackdrop" aria-hidden />

      <motion.div
        className="menuCard"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="menuHero">
          <img className="menuHeroImg" src="/cover.jpg" alt="MiniVocalGame" />
          <div className="menuHeroOverlay" aria-hidden />
        </div>

        <div className="menuHead">
          <div className="menuKicker">Jivoi Zvuk</div>
          <h2 className="menuTitle">MiniVocalGame</h2>
          <div className="menuSub">Vocal Pitch Challenge</div>
        </div>

        <div className="menuButtons">
          <button className="menuPrimary" onClick={onStart} type="button">
            ▶ Start Singing
          </button>
          <button className="menuSecondary" onClick={onLeaderboard} type="button">
            🏆 Leaderboard
          </button>
        </div>

        <div className="menuTip">Tip: use headphones for best accuracy.</div>
      </motion.div>
    </div>
  );
}
