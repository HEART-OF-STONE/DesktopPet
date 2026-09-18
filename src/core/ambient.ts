import type { AmbientMotion, Preferences } from './types';

export interface AmbientState { motion:AmbientMotion|'idle'; until:number; nextAt:number; last:AmbientMotion|null; sequence:number; observedAt:number }
export const ambientInitial=():AmbientState=>({motion:'idle',until:0,nextAt:0,last:null,sequence:0,observedAt:0});
export const ambientDuration:Record<AmbientMotion,number>={stretch:4200,look:5000,doze:8000,stroll:6000};
export const ambientLabel:Record<AmbientMotion,string>={stretch:'伸懒腰',look:'四处看看',doze:'打盹',stroll:'挪一挪'};
export function ambientDelay(frequency:Preferences['ambientFrequency'],random:number){
  const [low,high]=frequency==='low'?[90000,180000]:frequency==='lively'?[20000,40000]:[45000,90000];
  return low+(high-low)*Math.max(0,Math.min(1,random));
}
export function ambientAllowed(p:Preferences,blocked:boolean,visible:boolean){return p.ambientEnabled&&!p.quiet&&p.petVisible&&!blocked&&visible;}
export function ambientStep(s:AmbientState,now:number,p:Preferences,allowed:boolean,random:number):AmbientState {
  const later=now+ambientDelay(p.ambientFrequency,random);
  // A hidden window or sleeping machine resumes with a fresh cooldown, never a backlog.
  if(!allowed||!s.nextAt||(s.observedAt>0&&now-s.observedAt>5000)||now<s.observedAt)return {...s,motion:'idle',until:0,nextAt:later,observedAt:now};
  if(s.motion!=='idle')return now<s.until?{...s,observedAt:now}:{...s,motion:'idle',until:0,nextAt:later,observedAt:now};
  if(now<s.nextAt)return {...s,observedAt:now};
  const choices=(['stretch','look','doze',...(p.ambientRange==='still'?[]:['stroll'])] as AmbientMotion[]).filter(m=>m!==s.last);
  const motion=choices[Math.min(choices.length-1,Math.floor(Math.max(0,random)*choices.length))];
  return {...s,motion,last:motion,until:now+ambientDuration[motion],nextAt:later,sequence:s.sequence+1,observedAt:now};
}
export function ambientTravel(p:Preferences){return p.ambientRange==='still'?0:p.ambientRange==='small'?8:18;}
