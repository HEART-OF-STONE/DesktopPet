import { compactNumber, quotaDuration, quotaWindows, quotaName, quotaObservation, codexCredits, estimateLabel, type IntegrationSnapshot } from './integrations';
import type { PetMotion } from './types';
export interface PetAgentStatus {kind:string;label:string;source:string;count:number;updatedAt:number|null}
const labels:Record<string,string>={running:'工作中',waiting:'等待确认',completed:'刚刚完成',failed:'任务出错',interrupted:'已中断',balance:'余额提醒'};
export const statusLabel=(kind:string)=>labels[kind]||'安静陪伴';
export const agentMotion=(kind:string):PetMotion=>({running:'thinking',waiting:'attention',completed:'celebrate',failed:'error',balance:'attention',interrupted:'sleepy'} as Record<string,PetMotion>)[kind]||'idle';
export const demoText:Record<string,string>={running:'演示：正在认真工作，稍等我一下。',waiting:'演示：需要你确认一下，回来看看吧。',completed:'演示：任务完成啦，辛苦了！',failed:'演示：任务遇到问题，请查看 Agent。',balance:'演示：余额低于阈值，记得查看看板。'};
export function selectAgentStatus(data:IntegrationSnapshot,now:number):PetAgentStatus {
  const tasks=data.tasks.filter(t=>t.source==='codex'?(data.settings.codexEnabled||data.settings.bridgeEnabled):data.settings.bridgeEnabled);
  const age=(at:number)=>Math.max(0,now-at);
  const active=tasks.filter(t=>['running','waiting'].includes(t.status)&&age(t.updatedAt)<30*60000);
  for(const kind of ['waiting','failed','running','completed','interrupted']){
    const match=tasks.filter(t=>t.status===kind&&age(t.updatedAt)<(['running','waiting'].includes(kind)?30*60000:kind==='failed'?5*60000:60000)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(match)return {kind,label:statusLabel(kind),source:match.source,count:active.length,updatedAt:match.updatedAt};
  }
  const stale=tasks.filter(t=>['running','waiting'].includes(t.status)).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(stale)return {kind:'stale',label:'状态待核实',source:stale.source,count:0,updatedAt:stale.updatedAt};
  const label=data.settings.codexEnabled?(data.scanError?'采集暂不可用':data.scanPending?'历史补读中':!data.scanAt?'正在读取状态':'暂无活跃任务'):data.settings.bridgeEnabled?'等待 Agent 事件':'未开启联动';
  return {kind:'idle',label,source:'',count:0,updatedAt:data.scanAt};
}
export function petMetric(data:IntegrationSnapshot,now:number):string {
  switch(data.settings.petMetric){
    case 'credits':{const c=codexCredits(data,now);return `Codex ${c.displayLabel} ${c.displayValue}${c.stale?' · 待更新':''}`;}
    case 'estimate':return `今日预估 ${estimateLabel(data.estimate?.today)}${data.scanPending?' · 补读中':data.scanError?' · 采集异常':''}`;
    case 'tokens':return data.scanAt||data.retainedRecords?`今日 ${compactNumber(data.today.total)} tokens${data.scanPending?' · 补读中':''}`:'今日用量暂无数据';
    case 'balance':return data.balance.total===null?'DeepSeek 余额未获取':`DeepSeek ${data.balance.currency} ${data.balance.total.toFixed(2)}${data.balance.error||!data.settings.deepseekEnabled||now-(data.balance.updatedAt||0)>180000?' · 旧值':''}`;
    case 'quota':{const all=quotaWindows(data.quota);const windows=all.filter(w=>w.bucket===(all[0]?.bucket));if(!windows.length)return 'Codex 额度暂无数据';return `${quotaName(windows[0])} ${windows.map(w=>`${quotaDuration(w.windowMinutes)}剩余 ${(100-w.usedPercent).toFixed(0)}%`).join(' / ')} · ${windows.some(w=>quotaObservation(w,now).includes('待更新'))?'待更新':windows.some(w=>w.source==='local_log')?'快照':'查询值'}`;}
    default:return '';
  }
}
