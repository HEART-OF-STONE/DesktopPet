import { useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Preferences, HitRegion } from './core/types';

export function PetBubble({text,anchor,bounds,preferences,onClose}:{text:string;anchor:{x:number;y:number};bounds?:HitRegion;preferences:Preferences;onClose:()=>void}){
  const element=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState({left:8,top:8});
  useLayoutEffect(()=>{
    const update=()=>{
      const box=element.current!.getBoundingClientRect();
      const area=bounds||{x:0,y:0,width:window.innerWidth,height:window.innerHeight};
      const left=Math.max(area.x+8,Math.min(area.x+area.width-box.width-8,anchor.x-box.width/2+(preferences.bubbleOffsetX||0)));
      const top=Math.max(area.y+8,Math.min(area.y+area.height-box.height-8,anchor.y-box.height-10+(preferences.bubbleOffsetY||0)));
      setPosition(p=>p.left===left&&p.top===top?p:{left,top});
    };
    const observer=new ResizeObserver(update);observer.observe(element.current!);update();
    window.addEventListener('resize',update);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[anchor.x,anchor.y,bounds?.x,bounds?.y,bounds?.width,bounds?.height,preferences.bubbleOffsetX,preferences.bubbleOffsetY,text]);
  return <div ref={element} className="pet-bubble" style={position}>
    <span role="status" title={text}>{text}</span><button aria-label="关闭气泡" onClick={onClose}><X size={13}/></button>
  </div>;
}
