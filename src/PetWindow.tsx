import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Settings2, X } from 'lucide-react';
import { useCompanion, useSnapshot, useSubscription } from './core/hooks';
import { builtins } from './core/packs';
import { petDisplayName } from './core/petNames';
import { PetRenderer } from './renderers/PetRenderer';
import { beginDrag, desktop, desktopAction, reportHitRegions } from './platform/bridge';
import type { HitRegion } from './core/types';
import { useAgentBubble } from './core/agentNotices';
import { PetAgentStatus } from './PetAgentStatus';
import { useAmbient } from './core/useAmbient';
import { ambientTravel } from './core/ambient';
import { PetBubble } from './PetBubble';
import { choosePanelSide, type PanelSide } from './core/panelLayout';

export function PetWindow() {
  const {snapshot}=useSnapshot();const [avoiding,setAvoiding]=useState(false);
  const preferences={...snapshot.preferences,quiet:snapshot.preferences.quiet||avoiding};
  const companion=useCompanion(preferences); const [pressed,setPressed]=useState(false);
  const [dragDirection,setDragDirection]=useState(0);const [dragging,setDragging]=useState(false);
  const [workArea,setWorkArea]=useState<HitRegion>();
  const agentBubble=useAgentBubble(preferences,companion.action!=='idle'||pressed);
  const ambient=useAmbient(snapshot.preferences,companion.action!=='idle'||pressed||!!companion.bubble||agentBubble.motion!=='idle'||!!agentBubble.demo||!!agentBubble.text,true);
  const pack=[...builtins,...snapshot.customPets].find(p=>p.id===snapshot.preferences.petId)||builtins[0];
  const skin=pack.skins.find(s=>s.id===snapshot.preferences.skinId)||pack.skins[0];
  const name=petDisplayName(pack,snapshot.preferences);
  const [viewport,setViewport]=useState({width:window.innerWidth,height:window.innerHeight});
  useEffect(()=>{const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const shown=agentBubble.data.settings.showPetStatus||!!agentBubble.demo;
  const layout=shown?(agentBubble.data.settings.petLayout||'side'):'compact';
  const side=layout==='side';const bottom=layout==='bottom';
  const [panelSide,setPanelSide]=useState<PanelSide>('right');
  const panelScale=snapshot.preferences.panelScale;
  const [panelHeight,setPanelHeight]=useState(180);
  useEffect(()=>{const panel=document.querySelector('.pet-agent-status');if(!panel)return;const observer=new ResizeObserver(()=>setPanelHeight(panel.getBoundingClientRect().height));observer.observe(panel);return()=>observer.disconnect();},[layout,panelScale]);
  const petSize=Math.min((side?288:256)*snapshot.preferences.scale,Math.max(64,viewport.width-(side?2*(224*panelScale+20):64)),bottom?Math.max(64,viewport.height-panelHeight-60):Infinity);
  // Built-in canvases have empty space beside the tail. Keep the visible gap
  // close to the reference while reserving room for configured wandering.
  const sideInset=side&&builtins.some(p=>p.id===pack.id)?Math.max(0,petSize*0.085-ambientTravel(snapshot.preferences)):0;
  const previous=useRef(snapshot.timer.status); const controls=useRef<HTMLDivElement>(null);
  const placementKey=useRef('');
  const [bubbleAnchor,setBubbleAnchor]=useState({x:window.innerWidth/2,y:window.innerHeight-300});
  useSubscription<number>('pet-drag-direction',value=>{setDragDirection(Math.sign(value));setDragging(true);});
  useSubscription<string>('pet-gesture',value=>{setPressed(false);setDragging(false);setDragDirection(0);companion.play(value==='drag'?'drag':'pet');});
  useSubscription<boolean>('pet-fullscreen-avoid',value=>{setAvoiding(value);companion.dismiss();agentBubble.dismiss();setPressed(false);setDragging(false);setDragDirection(0);});
  useEffect(()=>{if(!side)return;const panel=document.querySelector('.pet-agent-status')?.getBoundingClientRect();if(!panel||!workArea)return;const half=petSize/2-sideInset;setPanelSide(current=>choosePanelSide(snapshot.preferences.panelSide,current,viewport.width/2-half-workArea.x,workArea.x+workArea.width-viewport.width/2-half,panel.width));},[side,workArea,viewport.width,petSize,sideInset,panelScale,snapshot.preferences.panelSide]);
  useEffect(()=>{if(snapshot.timer.status==='done'&&previous.current!=='done') companion.play('celebrate'); previous.current=snapshot.timer.status;},[snapshot.timer.status]);
  const report=(regions:HitRegion[])=>{
    if(regions.length){
      const x=Math.round((Math.min(...regions.map(r=>r.x))+Math.max(...regions.map(r=>r.x+r.width)))/2);
      const y=Math.round(Math.min(...regions.map(r=>r.y)));
      setBubbleAnchor(p=>Math.abs(p.x-x)<2&&Math.abs(p.y-y)<2?p:{x,y});
    }
    if(controls.current){const r=controls.current.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});}
    const status=document.querySelector<HTMLElement>('.pet-agent-status');
    if(status){const r=status.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});}
    const left=Math.min(...regions.map(r=>r.x)),top=Math.min(...regions.map(r=>r.y));
    const placement=regions.length?{x:left,y:top,width:Math.max(...regions.map(r=>r.x+r.width))-left,height:Math.max(...regions.map(r=>r.y+r.height))-top}:undefined;
    const bubble=document.querySelector<HTMLElement>('.pet-bubble');
    if(bubble){const r=bubble.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});}
    document.querySelectorAll<HTMLElement>('.pet-agent-card').forEach(element=>{const r=element.getBoundingClientRect();regions.push({x:r.x,y:r.y,width:r.width,height:r.height});});
    const key=`${layout}:${panelSide}:${panelScale}:${pack.id}:${skin.id}:${petSize}:${panelHeight}`;const reposition=key!==placementKey.current;placementKey.current=key;
    const figure=document.querySelector('.pet-figure')?.getBoundingClientRect();const anchor=figure?{x:figure.x,y:figure.y,width:figure.width,height:figure.height}:undefined;
void reportHitRegions(regions.slice(0,256),placement,reposition,anchor).then(area=>{if(area){const x=Math.min(window.innerWidth,area.x),y=Math.min(window.innerHeight,area.y);const bounded={x,y,width:Math.max(0,Math.min(area.width,window.innerWidth-x)),height:Math.max(0,Math.min(area.height,window.innerHeight-y))};setWorkArea(old=>old&&['x','y','width','height'].every(k=>Math.abs(old[k as keyof HitRegion]-bounded[k as keyof HitRegion])<1)?old:bounded);}}).catch(console.error);
  };
  return <div className="desktop-pet" style={workArea?{'--pet-safe-left':`${workArea.x}px`,'--pet-safe-top':`${workArea.y}px`,'--pet-safe-width':`${workArea.width}px`,'--pet-safe-height':`${workArea.height}px`,'--pet-safe-right':`${Math.max(0,viewport.width-workArea.x-workArea.width)}px`,'--pet-safe-bottom':`${Math.max(0,viewport.height-workArea.y-workArea.height)}px`} as CSSProperties:undefined}>
    {!avoiding&&(companion.bubble||agentBubble.text)&&(!snapshot.preferences.quiet||companion.action==='celebrate')&&<PetBubble text={companion.bubble||agentBubble.text} anchor={bubbleAnchor} bounds={workArea} preferences={snapshot.preferences} onClose={()=>{companion.dismiss();agentBubble.dismiss();}}/>}
    <div className={`pet-layout ${side?`pet-layout-side panel-${panelSide}`:bottom?'pet-layout-bottom':''}`} style={{'--pet-side-offset':`${petSize/2-sideInset+4}px`,minHeight:side?panelHeight+27:undefined} as CSSProperties}>
    <div className="pet-figure" style={{marginBottom:bottom&&builtins.some(p=>p.id===pack.id)?-petSize*.10:0}}>
    <div className="desktop-character" style={{'--ambient-travel':`${ambientTravel(snapshot.preferences)}px`,'--drag-tilt':`${dragDirection*5}deg`} as CSSProperties} onContextMenu={e=>{e.preventDefault();void desktopAction('settings');}}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();setPressed(true);setDragging(false);setDragDirection(0);if(desktop)void beginDrag().catch(()=>setPressed(false));else e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerUp={()=>{if(!desktop){setPressed(false);companion.play('pet');}}}>
      <PetRenderer pack={pack} skin={skin} displayName={name} action={dragging?'drag':companion.action!=='idle'?companion.action:agentBubble.motion!=='idle'?agentBubble.motion:ambient.motion} sequence={companion.sequence+agentBubble.sequence+ambient.sequence} size={petSize} pressed={pressed&&!dragging} onRegions={report}/>
    </div>
    <div className="pet-controls" ref={controls}>
      <button aria-label="打开桌边" onClick={()=>void desktopAction('settings')}><Settings2 size={14}/></button>
      <span title={name}>{name}</span>
      <button aria-label="隐藏宠物" onClick={()=>void desktopAction('hide')}><X size={14}/></button>
    </div>
    </div>
    <div className="pet-status-shell"><PetAgentStatus agent={agentBubble} quiet={snapshot.preferences.quiet} scale={panelScale}/></div>
    </div>
  </div>;
}
