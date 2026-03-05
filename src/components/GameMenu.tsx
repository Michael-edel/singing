
import { motion } from "framer-motion";

type Props = {
  onStart: () => void;
  onDaily: () => void;
  onLeaderboard: () => void;
};

export default function GameMenu({onStart,onDaily,onLeaderboard}:Props){
  return (
    <div className="menu">
      <motion.h1
        className="menuTitle"
        initial={{opacity:0,y:-20}}
        animate={{opacity:1,y:0}}
      >
        🎤 Vocal Pitch Challenge
      </motion.h1>

      <div className="menuButtons">
        <button onClick={onStart}>▶ Start Singing</button>
        <button onClick={onDaily}>🎯 Daily Challenge</button>
        <button onClick={onLeaderboard}>🏆 Leaderboard</button>
      </div>
    </div>
  );
}
