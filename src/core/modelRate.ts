import type {AgentTask,IntegrationSnapshot} from './integrations';
const outputRate=(task:AgentTask):number|null=>{
  const duration=task.timing?.durationMs,output=task.timing?.outputTokens;
  return task.status==='completed'&&typeof duration==='number'&&Number.isFinite(duration)&&duration>0&&typeof output==='number'&&Number.isFinite(output)&&output>=0?output/(duration/1000):null;
};

export const MODEL_RATE_SAMPLE_MS=5000;
const HISTORY_MS=24*60*60*1000,MAX_ROUNDS=20,MIN_SAMPLE_MS=2000;
export interface ModelRate {kind:'reference'|'observed';rate:number;model:string;samples:number;observedAt:number;stale:boolean}
export interface RateSampleState {key:string;sampledAt:number;nextAt:number;value?:ModelRate}
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;

export function observedModelRate(task:AgentTask,now:number):ModelRate|undefined{
  if(!['running','waiting'].includes(task.status))return;
  const start=task.timing?.startedAt,sample=task.timing?.outputSample;
  if(!valid(start)||start===0||!sample||!valid(sample.at)||sample.at>now||sample.at-start<MIN_SAMPLE_MS||sample.at-start>30*60*1000||!valid(sample.tokens)||sample.tokens===0)return;
  const rate=sample.tokens/((sample.at-start)/1000);
  return Number.isFinite(rate)?{kind:'observed',rate,model:task.model||'',samples:1,observedAt:sample.at,stale:now-sample.at>=30000}:undefined;
}
export function referenceModelRate(data:IntegrationSnapshot|undefined,task:AgentTask,now:number):ModelRate|undefined{
  if(!task.model||task.source==='demo'||task.source==='codex'&&data?.settings.codexEnabled===false)return;
  const rounds=(data?.tasks??[]).filter(t=>t.id!==task.id&&t.source===task.source&&t.model===task.model&&t.updatedAt<=now&&t.updatedAt>=now-HISTORY_MS&&outputRate(t)!==null&&t.timing!.outputTokens!>0&&t.timing!.durationMs!>=MIN_SAMPLE_MS&&t.timing!.durationMs!<=30*60*1000)
    .sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,MAX_ROUNDS);
  if(!rounds.length)return;
  const output=rounds.reduce((n,t)=>n+t.timing!.outputTokens!,0),duration=rounds.reduce((n,t)=>n+t.timing!.durationMs!,0);
  const rate=output/(duration/1000);
  return Number.isFinite(rate)?{kind:'reference',rate,model:task.model,samples:rounds.length,observedAt:rounds[0].updatedAt,stale:false}:undefined;
}
// Shared UI clocks already tick for elapsed time. Speed samples are capped at
// one per five seconds, with an immediate reset when the task/model changes.
export function sampleModelRate(previous:RateSampleState|undefined,data:IntegrationSnapshot|undefined,task:AgentTask|undefined,now:number):RateSampleState{
  if(!task||task.source==='demo'||!['running','waiting'].includes(task.status)||task.source==='codex'&&data?.settings.codexEnabled===false)return {key:'',sampledAt:now,nextAt:now};
  const key=JSON.stringify([task.source,task.sessionId,task.id,task.model||'']);
  if(previous?.key===key&&now>=previous.sampledAt&&now<previous.nextAt)return previous;
  return {key,sampledAt:now,nextAt:now+MODEL_RATE_SAMPLE_MS,value:observedModelRate(task,now)??referenceModelRate(data,task,now)};
}
export function modelRateLabel(value:ModelRate){return `${value.rate>0&&value.rate<0.01?'<0.01':value.rate.toLocaleString('en-US',{maximumFractionDigits:2})} tok/s`;}
export function modelRateNote(value:ModelRate){
  return value.kind==='reference'?`${value.model} 最近 24 小时内 ${value.samples} 个完整轮次的输出 / 总耗时，仅作参考，包含推理、工具和等待时间。`:
    `本轮累计输出 / 从轮次开始至最近输出样本的耗时，包含推理和等待时间。截止 ${new Date(value.observedAt).toLocaleTimeString('zh-CN')}；没有新数据时保留该样本。`;
}
