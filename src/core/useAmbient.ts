import { useEffect, useRef, useState } from 'react';
import { useSubscription } from './hooks';
import { ambientAllowed, ambientDelay, ambientDuration, ambientInitial, ambientStep } from './ambient';
import type { AmbientMotion, Preferences } from './types';

export function useAmbient(p:Preferences,blocked:boolean,automatic:boolean){
  const [state,setState]=useState(ambientInitial);
  const current=useRef({p,blocked,automatic});current.current={p,blocked,automatic};
  useSubscription<AmbientMotion|'stop'>('ambient-preview',kind=>{
    const now=Date.now();const allowed=ambientAllowed(p,blocked,!document.hidden);
    setState(s=>kind==='stop'||!allowed?{...s,motion:'idle',until:0,nextAt:now+ambientDelay(p.ambientFrequency,Math.random())}:
      {...s,motion:kind,last:kind,until:now+ambientDuration[kind],sequence:s.sequence+1,observedAt:now,nextAt:now+ambientDelay(p.ambientFrequency,Math.random())});
  });
  useEffect(()=>{
    const tick=()=>{const {p,blocked,automatic}=current.current;setState(s=>{
      const allowed=ambientAllowed(p,blocked,!document.hidden);
      if(!automatic&&s.motion==='idle')return s;
      return ambientStep(s,Date.now(),p,allowed,Math.random());
    });};
    const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[]);
  useEffect(()=>{setState(s=>({...s,motion:'idle',until:0,nextAt:Date.now()+ambientDelay(p.ambientFrequency,Math.random())}));},[blocked,p.ambientEnabled,p.ambientFrequency,p.ambientRange,p.quiet,p.petVisible,p.petId]);
  return {motion:ambientAllowed(p,blocked,!document.hidden)?state.motion:'idle',sequence:state.sequence};
}
