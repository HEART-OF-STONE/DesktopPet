import { describe,expect,it } from 'vitest';
import { defaultSnapshot } from './types';
import { ambientAllowed,ambientDelay,ambientInitial,ambientStep,ambientTravel } from './ambient';
describe('local companion scheduling',()=>{
  const p=defaultSnapshot().preferences;
  it('waits for a cooldown and avoids repeating the previous motion',()=>{
    let s=ambientStep(ambientInitial(),1000,p,true,0);
    expect(s.motion).toBe('idle');expect(s.nextAt).toBe(46000);
    s=ambientStep({...s,observedAt:45000},46000,p,true,0);expect(s.motion).toBe('stretch');
    s=ambientStep({...s,observedAt:50000},51000,p,true,0);expect(s.motion).toBe('idle');
    s=ambientStep({...s,observedAt:s.nextAt-1000},s.nextAt,p,true,0);expect(s.motion).toBe('look');
  });
  it('cancels blocked activity and starts a new cooldown after sleep',()=>{
    const active={...ambientInitial(),motion:'doze' as const,until:10000,nextAt:60000,observedAt:1000};
    expect(ambientStep(active,2000,p,false,0).motion).toBe('idle');
    const resumed=ambientStep(active,3600000,p,true,0);expect(resumed.motion).toBe('idle');expect(resumed.nextAt).toBeGreaterThan(3600000);
    expect(ambientAllowed({...p,quiet:true},false,true)).toBe(false);
    expect(ambientAllowed({...p,petVisible:false},false,true)).toBe(false);
    expect(ambientAllowed(p,true,true)).toBe(false);expect(ambientAllowed(p,false,false)).toBe(false);
  });
  it('keeps motion range and cadence bounded',()=>{
    expect(ambientDelay('low',0)).toBe(90000);expect(ambientDelay('lively',1)).toBe(40000);
    expect(ambientTravel(p)).toBe(0);expect(ambientTravel({...p,ambientRange:'medium'})).toBe(18);
    const ready={...ambientInitial(),nextAt:2000,observedAt:1000};
    expect(ambientStep(ready,2000,p,true,1).motion).not.toBe('stroll');
    expect(ambientStep(ready,2000,{...p,ambientRange:'medium'},true,1).motion).toBe('stroll');
  });
});
