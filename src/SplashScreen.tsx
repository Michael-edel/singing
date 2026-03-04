
import React from "react";

export default function SplashScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={{
      position:"fixed",
      inset:0,
      background:"#06070d",
      display:"flex",
      flexDirection:"column",
      alignItems:"center",
      justifyContent:"center",
      color:"white",
      fontFamily:"system-ui"
    }}>
      <img src="/logo.png" style={{width:"min(500px,80vw)", marginBottom:30,
        filter:"drop-shadow(0 0 20px #8b7dff)"}}/>
      <button
        onClick={onStart}
        style={{
          padding:"14px 40px",
          fontSize:18,
          borderRadius:14,
          border:"none",
          cursor:"pointer",
          background:"linear-gradient(135deg,#7c6cff,#4bc7ff)",
          color:"white"
        }}
      >
        START GAME
      </button>
    </div>
  );
}
