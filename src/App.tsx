import { useState } from "react";
import MiniVocalGame from "./MiniVocalGame";
import SplashScreen from "./SplashScreen";

export default function App() {
  const [started, setStarted] = useState(false);

  return (
    <>
      {!started && <SplashScreen onStart={() => setStarted(true)} />}
      {started && <MiniVocalGame />}
    </>
  );
}
