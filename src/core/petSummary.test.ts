import {describe,it,expect} from 'vitest';
import {emptyIntegrations} from './integrations';
import {detailQuotas,summaryEstimate,summaryQuotas} from './petSummary';
describe('side panel data',()=>{
  it('keeps weekly quota left and 5h right, excluding Spark',()=>{
    const d=structuredClone(emptyIntegrations);d.quota.updatedAt=1000;d.quota.source='local_log';
    d.quota.windows=[{bucket:'codex',label:'primary',windowMinutes:300,usedPercent:20,resetsAt:null},{bucket:'codex_bengalfox',label:'primary',windowMinutes:300,usedPercent:0,resetsAt:null},{bucket:'codex',label:'secondary',windowMinutes:10080,usedPercent:34,resetsAt:null}];
    expect(summaryQuotas(d,1000).map(w=>[w.label,w.remaining])).toEqual([['周剩余',66],['5h 剩余',80]]);
    d.quota.windows.shift();expect(summaryQuotas(d,1000).map(w=>w.label)).toEqual(['周剩余']);
    d.quota.windows.pop();expect(summaryQuotas(d,1000)).toEqual([]);
  });
  it('marks paused collection and expired quota without resetting the number',()=>{
    const d=structuredClone(emptyIntegrations);d.quota.updatedAt=1000;d.quota.windows=[{bucket:'codex',label:'primary',windowMinutes:300,usedPercent:80,resetsAt:1500}];
    expect(summaryQuotas(d,2000)[0]).toMatchObject({remaining:20,stale:true});d.quota.windows[0].resetsAt=null;d.settings.codexEnabled=false;
    expect(summaryQuotas(d,1000)[0].stale).toBe(true);
  });
  it('distinguishes zero, tiny estimates, no records and unpriced records',()=>{
    const t={usd:0,records:1,unpriced:0,invalid:0};
    expect(summaryEstimate(t).value).toBe('≈$0.00');expect(summaryEstimate({...t,usd:0.001}).value).toBe('<$0.01');
    expect(summaryEstimate({...t,usd:null}).note).toBe('未计价');expect(summaryEstimate({...t,records:0}).note).toBe('暂无记录');
    expect(summaryEstimate({...t,usd:6.2918,unpriced:1})).toEqual({value:'≈$6.29',note:'部分计价'});
  });
  it('folds only stale supplementary quotas and keeps main quotas visible',()=>{
    const d=structuredClone(emptyIntegrations);d.settings.codexEnabled=true;
    d.quota.windows=[
      {bucket:'codex',label:'secondary',windowMinutes:10080,usedPercent:34,resetsAt:null,updatedAt:1},
      {bucket:'spark',label:'primary',windowMinutes:300,usedPercent:12,resetsAt:2000001,updatedAt:2000000},
      {bucket:'reserve',label:'secondary',windowMinutes:10080,usedPercent:10,resetsAt:null,updatedAt:1},
    ];
    expect(detailQuotas(d,2000000).visible.map(w=>w.bucket)).toEqual(['codex','spark']);
    expect(detailQuotas(d,2000000).older.map(w=>w.bucket)).toEqual(['reserve']);
    expect(detailQuotas(d,2000001).older.map(w=>w.bucket)).toContain('spark');
    d.settings.codexEnabled=false;
    expect(detailQuotas(d,2000000).visible.map(w=>w.bucket)).toEqual(['codex']);
  });
});
