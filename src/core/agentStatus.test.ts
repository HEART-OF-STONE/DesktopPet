import { describe,it,expect } from 'vitest';
import { agentMotion,selectAgentStatus,petMetric } from './agentStatus';
import { emptyIntegrations, type IntegrationSnapshot } from './integrations';
const now=1789459200000;
const data=():IntegrationSnapshot=>structuredClone(emptyIntegrations);
const task=(status:string,updatedAt=now)=>({id:status,source:'codex',sessionId:'s',turnId:status,status,updatedAt,tokens:null});
describe('desktop Agent presentation',()=>{
  it('prioritizes input over failures and running tasks, regardless of array order',()=>{const d=data();d.tasks=[task('running'),task('failed'),task('waiting')];expect(selectAgentStatus(d,now)).toMatchObject({kind:'waiting',count:2});d.tasks.pop();expect(selectAgentStatus(d,now).kind).toBe('failed');});
  it('expires activity and does not pretend an old task is still running',()=>{const d=data();d.tasks=[task('running',now-31*60000),task('completed',now-2*60000)];expect(selectAgentStatus(d,now).kind).toBe('stale');d.settings.codexEnabled=false;expect(selectAgentStatus(d,now).label).toBe('未开启联动');});
  it('preserves zero balance and differentiates missing and stale snapshots',()=>{const d=data();d.settings.petMetric='balance';expect(petMetric(d,now)).toContain('未获取');d.balance.total=0;d.balance.currency='CNY';expect(petMetric(d,now)).toContain('CNY 0.00');expect(petMetric(d,now)).toContain('旧值');d.settings.petMetric='quota';expect(petMetric(d,now)).toContain('暂无');d.quota={source:'local_log',updatedAt:now,windows:[{bucket:'codex',label:'primary',usedPercent:80,windowMinutes:300,resetsAt:null}],error:null};expect(petMetric(d,now)).toContain('剩余 20% · 快照');});
  it('uses distinct motions with a safe idle fallback',()=>{expect(['running','waiting','completed','failed'].map(agentMotion)).toEqual(['thinking','attention','celebrate','error']);expect(agentMotion('unknown')).toBe('idle');});
});
