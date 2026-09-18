import {describe,it,expect} from 'vitest';
import {emptyIntegrations,quotaWindows,quotaName,quotaObservation,type QuotaWindow} from './integrations';
import {petMetric} from './agentStatus';
const window=(bucket:string,minutes:number,usedPercent=0):QuotaWindow=>({bucket,label:String(minutes),usedPercent,windowMinutes:minutes,resetsAt:null});
describe('quota display',()=>{
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
