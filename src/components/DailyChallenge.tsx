
type Props={
 note:string;
 onStart:()=>void;
};

export default function DailyChallenge({note,onStart}:Props){
 return(
  <div className="daily">
    <h2>🎯 Daily Challenge</h2>
    <div className="dailyNote">
      Sing note: <b>{note}</b>
    </div>
    <button onClick={onStart}>Start</button>
  </div>
 );
}
