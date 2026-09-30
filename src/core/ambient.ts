import type { AmbientMotion, Preferences, PetPack } from './types';
import { motionDuration } from './motions';

export interface AmbientState { motion:AmbientMotion|'idle'; until:number; nextAt:number; last:AmbientMotion|null; sequence:number; observedAt:number; history:AmbientMotion[]; cooldowns:Partial<Record<AmbientMotion,number>> }
export const ambientInitial=():AmbientState=>({motion:'idle',until:0,nextAt:0,last:null,sequence:0,observedAt:0,history:[],cooldowns:{}});
export const ambientDuration:Record<AmbientMotion,number>={stretch:4200,look:5000,doze:8000,stroll:6000};
export const ambientLabel:Record<AmbientMotion,string>={stretch:'伸懒腰',look:'四处看看',doze:'打盹',stroll:'挪一挪'};
export function ambientDelay(frequency:Preferences['ambientFrequency'],random:number){
  const [low,high]=frequency==='low'?[90000,180000]:frequency==='lively'?[20000,40000]:[45000,90000];
  return low+(high-low)*Math.max(0,Math.min(1,random));
}
export function ambientAllowed(p:Preferences,blocked:boolean,visible:boolean){return p.ambientEnabled&&!p.quiet&&p.petVisible&&!blocked&&visible;}
export function ambientStep(s:AmbientState,now:number,p:Preferences,allowed:boolean,random:number,pack?:PetPack,delayRandom=random):AmbientState {
  const later=now+ambientDelay(p.ambientFrequency,delayRandom);
  // A hidden window or sleeping machine resumes with a fresh cooldown, never a backlog.
  if(!allowed||!s.nextAt||(s.observedAt>0&&now-s.observedAt>5000)||now<s.observedAt)return {...s,motion:'idle',until:0,nextAt:later,observedAt:now};
  if(s.motion!=='idle')return now<s.until?{...s,observedAt:now}:{...s,motion:'idle',until:0,nextAt:later,observedAt:now};
  if(now<s.nextAt)return {...s,observedAt:now};
  const choices=(['stretch','look','doze',...(p.ambientRange==='still'?[]:['stroll'])] as AmbientMotion[]).filter(m=>m!==s.last&&now>=(s.cooldowns[m]||0));
  if(!choices.length)return {...s,nextAt:now+5000,observedAt:now};
  const base:Record<AmbientMotion,number>={stretch:1,look:1.4,doze:.4,stroll:.8};
  const weights=choices.map(m=>(pack?.actions[m]?.weight??base[m])*Math.pow(.3,s.history.filter(h=>h===m).length));
  let pick=Math.max(0,Math.min(.999999,random))*weights.reduce((a,b)=>a+b,0),motion=choices[choices.length-1];
  for(let i=0;i<choices.length;i++){pick-=weights[i];if(pick<0){motion=choices[i];break;}}
  const duration=pack?motionDuration(pack,motion,s.sequence+1):ambientDuration[motion];
  const cooldown=pack?.actions[motion]?.cooldownMs??(motion==='doze'?180000:motion==='stretch'?90000:30000);
  return {...s,motion,last:motion,until:now+duration,nextAt:later,sequence:s.sequence+1,observedAt:now,
    history:[...s.history,motion].slice(-5),cooldowns:{...s.cooldowns,[motion]:now+duration+cooldown}};
}
export function ambientTravel(p:Preferences){return p.ambientRange==='still'?0:p.ambientRange==='small'?8:18;}
