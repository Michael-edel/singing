import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MiniVocalGame from "./MiniVocalGame";
import SplashScreen from "./SplashScreen";

export default function App() {
  const [started, setStarted] = useState(false);

  return (
    <AnimatePresence mode="wait">
      {!started ? (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SplashScreen onStart={() => setStarted(true)} />
        </motion.div>
      ) : (
        <motion.div
          key="game"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <MiniVocalGame />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
