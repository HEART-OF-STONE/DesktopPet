import { useEffect, useRef, useState } from 'react';
import { useSubscription } from './hooks';
import { emptyIntegrations, getIntegrations, type AgentNotice, type AgentDemo, type IntegrationSnapshot } from './integrations';
import { agentMotion, demoText, selectAgentStatus, statusLabel, type PetAgentStatus } from './agentStatus';
import type { PetMotion, Preferences } from './types';
import { softChime } from './audio';
export function useAgentBubble(preferences:Preferences,busy:boolean,sound=true){
  const [data,setData]=useState(emptyIntegrations);const [demo,setDemo]=useState<AgentDemo|null>(null);
  const [shown,setShown]=useState<AgentNotice|null>(null);const [sequence,setSequence]=useState(0);const [clock,setClock]=useState(Date.now());
  const queue=useRef<AgentNotice[]>([]);const seen=useRef(new Set<string>());const until=useRef(0);
  const dismissedDemo=useRef<string|null>(null);
  const state=useRef({preferences,busy,sound,demo});state.current={preferences,busy,sound,demo};
  useEffect(()=>{if(preferences.quiet){queue.current=[];setShown(null);until.current=0;}},[preferences.quiet]);
  useEffect(()=>{let live=true;getIntegrations().then(d=>{if(live){setData(d);setDemo(d.demo||null);}}).catch(console.error);return()=>{live=false;};},[]);
  useSubscription<IntegrationSnapshot>('integrations-changed',setData);
  useSubscription<AgentDemo|null>('agent-demo-changed',d=>{dismissedDemo.current=null;setDemo(d);setShown(null);until.current=0;setSequence(s=>s+1);if(d&&sound&&preferences.sound&&!preferences.quiet)softChime(preferences.volume);});
  useSubscription<AgentNotice>('agent-notice',notice=>{if(seen.current.has(notice.id))return;seen.current.add(notice.id);if(seen.current.size>200)seen.current.delete(seen.current.values().next().value!);setDemo(null);if(preferences.quiet)return;queue.current.push(notice);queue.current=queue.current.slice(-20);});
  useEffect(()=>{const timer=setInterval(()=>{
    const clock=Date.now();setClock(clock);const {preferences:p,busy,sound,demo}=state.current;
    if(demo&&demo.expiresAt<=clock)setDemo(null);
    if(p.quiet){queue.current=[];setShown(null);until.current=0;return;}
    if(clock<until.current||demo&&demo.expiresAt>clock)return;
    setShown(null);if(busy||!queue.current.length)return;
    const pending=queue.current.splice(0);const chosen=pending.find(n=>['waiting','failed','balance'].includes(n.kind))||pending[0];
    setShown({...chosen,text:pending.length>1?`${chosen.text}（另有 ${pending.length-1} 条更新）`:chosen.text});
    setSequence(s=>s+1);until.current=clock+7000;if(sound&&p.sound)softChime(p.volume);
  },500);return()=>clearInterval(timer);},[]);
  const liveDemo=demo&&demo.expiresAt>clock?demo:null;
  const status:PetAgentStatus=liveDemo?{kind:liveDemo.kind,label:statusLabel(liveDemo.kind),source:'演示 · Codex',count:1,updatedAt:liveDemo.expiresAt-10000}:selectAgentStatus(data,clock);
  const text=preferences.quiet||busy?'':liveDemo?(dismissedDemo.current===liveDemo.id?'':demoText[liveDemo.kind]||''):shown?.text||'';
  const motion:PetMotion=preferences.quiet||busy?'idle':liveDemo?agentMotion(liveDemo.kind):shown?agentMotion(shown.kind):['running','waiting'].includes(status.kind)?agentMotion(status.kind):'idle';
  return {text,motion,sequence,status,data,demo:liveDemo,clock,dismiss:()=>{dismissedDemo.current=liveDemo?.id||null;setShown(null);until.current=0;setClock(Date.now());}};
}
export type AgentPresentation=ReturnType<typeof useAgentBubble>;
