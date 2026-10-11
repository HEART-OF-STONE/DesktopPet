import {describe,expect,it} from 'vitest';
import {emptyIntegrations,type AgentTask} from './integrations';
import {observedModelRate,referenceModelRate,sampleModelRate} from './modelRate';

const round=(patch:Partial<AgentTask>={}):AgentTask=>({id:'done',source:'codex',sessionId:'s',turnId:'t',model:'gpt-6.1-sol',status:'completed',updatedAt:99000,tokens:100,timing:{durationMs:2000,outputTokens:80},...patch});
const active=(patch:Partial<AgentTask>={}):AgentTask=>round({id:'live',status:'running',updatedAt:100000,timing:{startedAt:98000},...patch});
const data=()=>structuredClone(emptyIntegrations);
describe('model speed samples',()=>{
  it('starts with a weighted reference for the exact model and source',()=>{
    const d=data(),t=active();d.tasks=[round(),round({id:'long',timing:{durationMs:6000,outputTokens:180}}),round({id:'other-model',model:'gpt-6-luna'}),round({id:'other-source',source:'other'}),round({id:'unknown',model:''})];
    const reference=referenceModelRate(d,t,100000)!;expect(reference.rate).toBe(32.5);expect(reference.samples).toBe(2);
    const sample=sampleModelRate(undefined,d,t,100000);expect(sample.value?.kind).toBe('reference');expect(sample.value?.rate).toBe(32.5);
    d.settings.codexEnabled=false;expect(sampleModelRate(sample,d,t,100001).value).toBeUndefined();
  });
  it('switches to observed output on the next five-second sample and never decays without new output',()=>{
    const d=data(),t=active();d.tasks=[round()];const a=sampleModelRate(undefined,d,t,100000);
    const observed={...t,timing:{startedAt:98000,outputSample:{at:100000,tokens:60}}};
    expect(sampleModelRate(a,d,observed,104999)).toBe(a);
    const b=sampleModelRate(a,d,observed,105000);expect(b.value?.kind).toBe('observed');expect(b.value?.rate).toBe(30);
    expect(sampleModelRate(b,d,observed,110000).value?.rate).toBe(30);expect(sampleModelRate(b,d,observed,130000).value?.stale).toBe(true);
    const next={...observed,timing:{startedAt:98000,outputSample:{at:108000,tokens:400}}};expect(sampleModelRate(b,d,next,110000).value?.rate).toBe(40);
  });
  it('resets immediately across tasks or models and removes cached values when a round ends',()=>{
    const d=data();d.tasks=[round()];const first=sampleModelRate(undefined,d,active(),100000);
    const next=sampleModelRate(first,d,active({id:'different',model:'gpt-6-luna'}),100001);expect(next.value).toBeUndefined();expect(next.key).not.toBe(first.key);
    expect(sampleModelRate(first,d,round(),100001).value).toBeUndefined();expect(sampleModelRate(first,d,undefined,100001).value).toBeUndefined();
    expect(sampleModelRate(first,d,active(),99999).sampledAt).toBe(99999);
  });
  it('rejects missing, reset, future, zero-output and too-short or too-long observations',()=>{
    const t=active();for(const sample of [null,{at:100000,tokens:null},{at:100000,tokens:0},{at:100001,tokens:80},{at:98500,tokens:80},{at:100000,tokens:NaN}])expect(observedModelRate({...t,timing:{startedAt:98000,outputSample:sample}},100000)).toBeUndefined();
    expect(observedModelRate({...t,timing:{startedAt:1,outputSample:{at:2000000,tokens:80}}},2000000)).toBeUndefined();
    expect(observedModelRate(round({timing:{startedAt:98000,outputSample:{at:100000,tokens:80}}}),100000)).toBeUndefined();
  });
  it('bounds history to twenty recent complete non-empty rounds and does not invent the model',()=>{
    const d=data();d.tasks=Array.from({length:25},(_,i)=>round({id:String(i),updatedAt:100000-i}));
    d.tasks.push(round({id:'future',updatedAt:100001}),round({id:'old',updatedAt:1}),round({id:'empty',timing:{durationMs:2000,outputTokens:0}}),round({id:'broken',timing:{durationMs:2000}}));
    expect(referenceModelRate(d,active(),100000)?.samples).toBe(20);
    expect(referenceModelRate(d,active({model:''}),100000)).toBeUndefined();expect(referenceModelRate(d,active({model:'gpt-6-luna'}),100000)).toBeUndefined();
    d.tasks=[round({updatedAt:1})];expect(referenceModelRate(d,active(),100000000)).toBeUndefined();
  });
});
