import { useEffect, useRef, useState } from 'react';
import { frameAt } from '../core/animation';
import type { Action, HitRegion, PetPack, Skin } from '../core/types';

interface Props {
  pack: PetPack; skin: Skin; action?: Action; sequence?: number; size?: number;
  pressed?: boolean; flipped?: boolean; paused?: boolean; onRegions?: (regions: HitRegion[]) => void;
  displayName?: string;
}
export function PetRenderer({pack, skin, action='idle', sequence=0, size=256, pressed=false, flipped=false, paused=false, onRegions, displayName=pack.name}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onRegions); callback.current = onRegions;
  const [error,setError] = useState('');
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext('2d', {willReadFrequently:true})!;
    let cancelled=false, animation=0, start=performance.now(), pauseAt=0, lastFrame=-1, lastReport=0;
    let regions: HitRegion[]=[];
    let currentClip = pack.actions[action] || pack.actions.idle;
    const resources=new Map<string,HTMLImageElement>();
    const maskCanvas=document.createElement('canvas'); maskCanvas.width=32; maskCanvas.height=32;
    const maskContext=maskCanvas.getContext('2d',{willReadFrequently:true})!;
    const clipCache=new Map<string,HitRegion[]>();
    const report = () => {
      if (!callback.current) return;
      const box=element.getBoundingClientRect();
      callback.current(regions.map(r => ({x:box.x+r.x*box.width,y:box.y+r.y*box.height,width:r.width*box.width,height:r.height*box.height})));
    };
    const draw = (time:number) => {
      if (cancelled) return;
      if (document.hidden || paused) { if (!pauseAt) pauseAt=time; animation=requestAnimationFrame(draw); return; }
      if (pauseAt) { start+=time-pauseAt; pauseAt=0; }
      const result=frameAt(currentClip,time-start);
      if (result.done && currentClip!==pack.actions.idle) { currentClip=pack.actions.idle; start=time; lastFrame=-1; }
      const index=frameAt(currentClip,time-start).index;
      const frame=currentClip.frames[index];
      if (lastFrame!==index) {
        const image=resources.get(frame.asset)!;
        context.clearRect(0,0,pack.width,pack.height);
        context.save();
        if (flipped) { context.translate(pack.width,0); context.scale(-1,1); }
        if (frame.x!==undefined) context.drawImage(image,frame.x,frame.y!,frame.width!,frame.height!,0,0,pack.width,pack.height);
        else { const ratio=Math.min(pack.width/image.width,pack.height/image.height); const w=image.width*ratio,h=image.height*ratio; context.drawImage(image,(pack.width-w)/2,(pack.height-h)/2,w,h); }
        context.restore(); lastFrame=index;
        if (callback.current) {
          const cacheKey=JSON.stringify(frame);
          if (!clipCache.has(cacheKey)) {
            maskContext.clearRect(0,0,32,32); maskContext.drawImage(element,0,0,32,32);
            const pixels=maskContext.getImageData(0,0,32,32).data;
            const mask:HitRegion[]=[];
            for(let y=0;y<32;y++) { let x=0; while(x<32) { while(x<32 && pixels[(y*32+x)*4+3]<30) x++; const begin=x; while(x<32 && pixels[(y*32+x)*4+3]>=30) x++; if(x>begin) mask.push({x:begin/32,y:y/32,width:(x-begin)/32,height:1/32}); } }
            clipCache.set(cacheKey,mask);
          }
          regions=clipCache.get(cacheKey)!;
        }
      }
      if (time-lastReport>100) { report(); lastReport=time; }
      // Static roles still update briefly for CSS transforms; stop the loop when no hit reporting is needed.
      if (pack.renderer==='sprite' || callback.current) animation=requestAnimationFrame(draw);
    };
    setError('');
    const keys=new Set([...currentClip.frames,...pack.actions.idle.frames].map(f=>f.asset));
    Promise.all([...keys].map(key=>new Promise<void>((resolve,reject)=>{
      const image=new Image(); image.onload=()=>{resources.set(key,image);resolve();}; image.onerror=()=>reject(new Error('图片加载失败')); image.src=skin.assets[key];
    }))).then(()=>{if(!cancelled){start=performance.now(); animation=requestAnimationFrame(draw);}}).catch(e=>!cancelled&&setError(String(e)));
    return ()=>{cancelled=true;cancelAnimationFrame(animation);resources.clear();clipCache.clear();};
  },[pack,skin,action,sequence,flipped,paused]);
  const ratio=Math.min(size/pack.width,size/pack.height);
  return <div className={`pet-art action-${action} ${pressed?'is-pressed':''}`} style={{width:pack.width*ratio,height:pack.height*ratio}}>
    <canvas ref={canvas} width={pack.width} height={pack.height} role="img" aria-label={`${displayName}，${pack.renderer==='static'?'静态图片':'逐帧动画'}`} />
    {error&&<span className="asset-error">图片暂时无法显示</span>}
  </div>;
}
