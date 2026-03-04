import { useEffect, useState } from "react"

export default function Splash({ onStart }: { onStart: () => void }) {

  const [visible,setVisible] = useState(false)

  useEffect(()=>{

    setTimeout(()=>setVisible(true),300)

  },[])

  return (

    <div className="splash">

      <img
        src="/logo.png"
        className={visible ? "logo show" : "logo"}
      />

      <button
        className="start"
        onClick={onStart}
      >
        START
      </button>

    </div>

  )
}