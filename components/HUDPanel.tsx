type Props = {
  liveHz:number
  target:string
  stars:number
  confidence:number
}

export default function HUDPanel(p:Props){

  return(

    <div className="hudGrid">

      <Stat label="Live Hz" value={p.liveHz.toFixed(1)} />

      <Stat label="Target" value={p.target} />

      <Stat label="Stars" value={"⭐".repeat(p.stars)} />

      <Stat label="Confidence" value={`${Math.round(p.confidence*100)}%`} />

    </div>

  )

}

function Stat({label,value}:{label:string,value:any}){

  return(

    <div className="statCard">

      <div className="statLabel">{label}</div>

      <div className="statValue">{value}</div>

    </div>

  )

}