import { useEffect, useRef, useState } from 'react';
import { useSubscription } from './hooks';
import { ambientAllowed, ambientDelay, ambientDuration, ambientInitial, ambientStep } from './ambient';
import type { AmbientMotion, Preferences, PetPack, PetMotion } from './types';
import { motionDuration } from './motions';

export function useAmbient(p:Preferences,blocked:boolean,automatic:boolean,pack?:PetPack){
  const [state,setState]=useState(ambientInitial);
  const current=useRef({p,blocked,automatic,pack});current.current={p,blocked,automatic,pack};
  useSubscription<AmbientMotion|'stop'>('ambient-preview',kind=>{
    const now=Date.now();const allowed=ambientAllowed(p,blocked,!document.hidden);
    setState(s=>kind==='stop'||!allowed?{...s,motion:'idle',until:0,nextAt:now+ambientDelay(p.ambientFrequency,Math.random())}:
      {...s,motion:kind,last:kind,until:now+(pack?motionDuration(pack,kind,s.sequence+1):ambientDuration[kind]),sequence:s.sequence+1,observedAt:now,nextAt:now+ambientDelay(p.ambientFrequency,Math.random())});
  });
  useEffect(()=>{
    const tick=()=>{const {p,blocked,automatic,pack}=current.current;setState(s=>{
      const allowed=ambientAllowed(p,blocked,!document.hidden);
      if(!automatic&&s.motion==='idle')return s;
      return ambientStep(s,Date.now(),p,allowed,Math.random(),pack,Math.random());
    });};
    const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[]);
  useEffect(()=>{setState(s=>({...s,motion:'idle',until:0,nextAt:Date.now()+ambientDelay(p.ambientFrequency,Math.random())}));},[blocked,p.ambientEnabled,p.ambientFrequency,p.ambientRange,p.quiet,p.petVisible,p.petId]);
  useEffect(()=>{setState(s=>({...ambientInitial(),sequence:s.sequence,nextAt:Date.now()+ambientDelay(p.ambientFrequency,Math.random())}));},[p.petId]);
  function complete(motion:PetMotion,sequence:number){const now=Date.now();setState(s=>s.sequence===sequence&&s.motion===motion?{...s,motion:'idle',until:0,nextAt:now+ambientDelay(p.ambientFrequency,Math.random())}:s);}
  return {motion:ambientAllowed(p,blocked,!document.hidden)?state.motion:'idle',sequence:state.sequence,complete};
}
