import { useState } from "react"
import Splash from "./Splash"
import Game from "./Game"

export default function App(){

  const [started,setStarted] = useState(false)

  return(

    <>
      {!started && (
        <Splash onStart={()=>setStarted(true)} />
      )}

      {started && <Game/>}
    </>
  )
}