import { useEffect, useRef, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { useCompanion, useSnapshot, useSubscription } from './core/hooks';
import { builtins } from './core/packs';
import { petDisplayName } from './core/petNames';
import { PetRenderer } from './renderers/PetRenderer';
import { beginDrag, desktop, desktopAction, reportHitRegions } from './platform/bridge';
import type { HitRegion } from './core/types';

export function PetWindow() {
  const {snapshot}=useSnapshot(); const companion=useCompanion(snapshot.preferences); const [pressed,setPressed]=useState(false);
  const pack=[...builtins,...snapshot.customPets].find(p=>p.id===snapshot.preferences.petId)||builtins[0];
  const skin=pack.skins.find(s=>s.id===snapshot.preferences.skinId)||pack.skins[0];
  const name=petDisplayName(pack,snapshot.preferences);
  const previous=useRef(snapshot.timer.status); const controls=useRef<HTMLDivElement>(null);
  useSubscription<string>('pet-gesture',value=>{setPressed(false);companion.play(value==='drag'?'drag':'pet');});
  useEffect(()=>{if(snapshot.timer.status==='done'&&previous.current!=='done') companion.play('celebrate'); previous.current=snapshot.timer.status;},[snapshot.timer.status]);
  const report=(regions:HitRegion[])=>{
    controls.current?.querySelectorAll<HTMLElement>('button').forEach(button=>{const r=button.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});});
    const close=document.querySelector<HTMLElement>('.pet-bubble button');
    if(close){const r=close.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});}
    void reportHitRegions(regions.slice(0,256)).catch(console.error);
  };
  return <div className="desktop-pet">
    {companion.bubble&&(!snapshot.preferences.quiet||companion.action==='celebrate')&&<div className="pet-bubble"><span>{companion.bubble}</span><button aria-label="关闭气泡" onClick={companion.dismiss}><X size={13}/></button></div>}
    <div className="desktop-character" onContextMenu={e=>{e.preventDefault();void desktopAction('settings');}}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();setPressed(true);if(desktop)void beginDrag().catch(()=>setPressed(false));else e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerUp={()=>{if(!desktop){setPressed(false);companion.play('pet');}}}>
      <PetRenderer pack={pack} skin={skin} displayName={name} action={companion.action} sequence={companion.sequence} size={256*snapshot.preferences.scale} pressed={pressed} onRegions={report}/>
    </div>
    <div className="pet-controls" ref={controls}>
      <button aria-label="打开桌边" onClick={()=>void desktopAction('settings')}><Settings2 size={14}/></button>
      <span title={name}>{name}</span>
      <button aria-label="隐藏宠物" onClick={()=>void desktopAction('hide')}><X size={14}/></button>
    </div>
  </div>;
}
