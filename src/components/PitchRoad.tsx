
import { useRef,useEffect } from "react";

type Point={cents:number};

type Props={points:Point[]};

export default function PitchRoad({points}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null);

 useEffect(()=>{
  const canvas=canvasRef.current;
  if(!canvas)return;

  const ctx=canvas.getContext("2d")!;
  const w=canvas.width;
  const h=canvas.height;

  ctx.clearRect(0,0,w,h);

  const mid=h/2;

  ctx.strokeStyle="#444";
  ctx.beginPath();
  ctx.moveTo(0,mid);
  ctx.lineTo(w,mid);
  ctx.stroke();

  ctx.strokeStyle="#00ffd5";
  ctx.beginPath();

  points.forEach((p,i)=>{
    const x=(i/points.length)*w;
    const y=mid-p.cents*2;

    if(i===0)ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });

  ctx.stroke();
 },[points]);

 return(
  <canvas
    ref={canvasRef}
    width={600}
    height={200}
    className="pitchRoad"
  />
 );
}
