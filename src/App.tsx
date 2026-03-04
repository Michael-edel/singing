import { useState } from "react";
import MiniVocalGame from "./MiniVocalGame";
import SplashScreen from "./SplashScreen";

export default function App() {
  
  const micStatus = typeof (window as any).__mvgMicStream !== 'undefined' ? 'Mic stream cached' : 'Mic not yet enabled';
const [started, setStarted] = useState(false);

  return (
    <>
      {!started && <SplashScreen onStart={() => setStarted(true)} />}
      {started && <MiniVocalGame />}
    </>
  );
}
