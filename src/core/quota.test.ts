import {describe,it,expect} from 'vitest';
import {emptyIntegrations,quotaWindows,quotaName,quotaObservation,codexCredits,type QuotaWindow} from './integrations';
import {petMetric} from './agentStatus';
const window=(bucket:string,minutes:number,usedPercent=0):QuotaWindow=>({bucket,label:String(minutes),usedPercent,windowMinutes:minutes,resetsAt:null});
describe('quota display',()=>{
  it('distinguishes credits from quota percentages, dollars, unknown and zero',()=>{
    const d=structuredClone(emptyIntegrations);d.settings.petMetric='credits';
    expect(codexCredits(d,1000)).toMatchObject({known:false,value:'—'});
    d.quota.credits={codex:{balance:1234.5,hasCredits:true,unlimited:false,updatedAt:1000,source:'local_log'}};
    expect(codexCredits(d,1000)).toMatchObject({known:true,stale:false,value:'1,234.5'});
    expect(petMetric(d,1000)).toBe('Codex 积分折合 $49.38');
    const c=d.quota.credits.codex;c.balance=0;c.hasCredits=false;
    expect(codexCredits(d,1000)).toMatchObject({known:true,value:'0'});
    c.balance=null;expect(codexCredits(d,1000)).toMatchObject({known:false,value:'—'});
    c.unlimited=true;expect(codexCredits(d,1000).value).toBe('不限量');
    c.unlimited=false;c.balance=Number.NaN;expect(codexCredits(d,1000).known).toBe(false);
  });
  it('does not freshen old credits from another quota snapshot',()=>{
    const d=structuredClone(emptyIntegrations);d.quota.updatedAt=1000000;
    d.quota.credits={codex:{balance:4,hasCredits:true,unlimited:false,updatedAt:1,source:'local_log'},other:{balance:999,hasCredits:true,unlimited:false,updatedAt:1000000,source:'app_server'}};
    expect(codexCredits(d,1000000)).toMatchObject({value:'4',stale:true});
    d.settings.codexEnabled=false;expect(codexCredits(d,2).stale).toBe(true);
    delete d.quota.credits.codex;expect(codexCredits(d,1000000).known).toBe(false);
  });
  it('converts credits locally with configurable rate and keeps raw and unknown values',()=>{
    const d=structuredClone(emptyIntegrations);d.quota.credits={codex:{balance:1000,hasCredits:true,unlimited:false,updatedAt:1000,source:'local_log'}};
    expect(codexCredits(d,1000)).toMatchObject({value:'1,000',usdValue:'$40.00',displayLabel:'积分折合'});
    d.settings.creditUsdRate=0.02;d.settings.creditsUnit='credits';
    expect(codexCredits(d,1000)).toMatchObject({value:'1,000',usdValue:'$20.00',displayValue:'1,000'});
    const c=d.quota.credits.codex;c.balance=-5;expect(codexCredits(d,1000).usdValue).toBe('-$0.10');
    c.balance=0.001;expect(codexCredits(d,1000).usdValue).toBe('<$0.01');
    c.balance=0;expect(codexCredits(d,1000).usdValue).toBe('$0.00');
    c.balance=null;expect(codexCredits(d,1000).usdValue).toBe('—');
    c.unlimited=true;expect(codexCredits(d,1000).usdValue).toBe('不限量');
    expect(d.today.total).toBe(0);expect(d.estimate).toBeUndefined();
  });
  it('shows both Plus main windows before Spark without dropping the fourth row',()=>{
    const d=structuredClone(emptyIntegrations);d.settings.petMetric='quota';
    d.quota={windows:[window('codex_bengalfox',10080),window('codex',10080,35),window('codex_bengalfox',300),window('codex',300,20)],updatedAt:1000000,source:'local_log',error:null};
    const sorted=quotaWindows(d.quota);expect(sorted.map(w=>[w.bucket,w.windowMinutes])).toEqual([['codex',300],['codex',10080],['codex_bengalfox',300],['codex_bengalfox',10080]]);
    expect(petMetric(d,1000000)).toContain('Codex 主额度 5 小时剩余 80% / 7 天剩余 65%');
    expect(quotaName(sorted[2])).toBe('GPT-5.3-Codex-Spark');
  });
  it('does not invent a 5-hour window and keeps per-bucket age and source',()=>{
    const d=structuredClone(emptyIntegrations);d.settings.petMetric='quota';
    d.quota={windows:[{...window('codex',10080,34),updatedAt:1,source:'app_server'},window('codex_bengalfox',300)],updatedAt:1000000,source:'local_log',error:null};
    expect(petMetric(d,1000000)).toContain('7 天剩余 66% · 待更新');expect(petMetric(d,1000000)).not.toContain('5 小时');
    const [main,spark]=quotaWindows(d.quota);expect(quotaObservation(main,1000000)).toContain('接口查询');expect(quotaObservation(main,1000000)).toContain('待更新');expect(quotaObservation(spark,1000000)).not.toContain('待更新');
    expect(quotaObservation({...spark,resetsAt:999999},1000000)).toContain('待更新');
  });
});
