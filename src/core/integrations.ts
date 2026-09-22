import { invoke } from '@tauri-apps/api/core';
import { desktop } from '../platform/bridge';
export interface IntegrationSettings {codexEnabled:boolean;codexHome:string;codexExecutable:string;bridgeEnabled:boolean;deepseekEnabled:boolean;lowBalance:number;dailyBudget:number;notifyCompleted:boolean;notifyFailed:boolean;notifyApproval:boolean;completionTemplate:string;showPetStatus:boolean;showPetCredits?:boolean;creditsUnit?:'usd'|'credits';creditUsdRate?:number;historyEnabled?:boolean;petLayout?:'side'|'bottom'|'compact';petMetric:'none'|'tokens'|'quota'|'credits'|'balance'|'estimate'}
export interface PriceRate {source:string;model:string;input:number;cached:number;output:number}
export interface EstimateTotal {usd:number|null;records:number;unpriced:number;invalid:number}
export interface Estimate {today:EstimateTotal;week:EstimateTotal;models:{source:string;model:string;total:EstimateTotal}[];rates:PriceRate[];updatedAt:number|null}
export function estimateLabel(t?:EstimateTotal){if(!t||!t.records)return '暂无记录';if(t.usd===null)return '未计价';const value=t.usd>0&&t.usd<0.0001?'< $0.0001':`$${t.usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4})}`;return value+(t.unpriced+t.invalid?' · 部分':'');}
export interface TokenUsage {input:number;cached:number;output:number;reasoning:number;total:number}
export interface AgentNotice {id:string;source:string;kind:string;text:string}
export interface AgentDemo {id:string;kind:string;expiresAt:number}
export interface InboxItem {id:string;source:string;kind:string;text:string;at:number;read:boolean}
export interface QuotaWindow {bucket:string;label:string;usedPercent:number;windowMinutes:number;resetsAt:number|null;limitName?:string|null;updatedAt?:number|null;source?:string}
export interface QuotaCredits {balance:number|null;hasCredits:boolean|null;unlimited:boolean|null;updatedAt:number;source:string}
export function codexCredits(data:IntegrationSnapshot,now:number){
  const c=data.quota.credits?.codex;
  const known=!!c&&(c.unlimited===true||(typeof c.balance==='number'&&Number.isFinite(c.balance)));
  const stale=!!c&&(!data.settings.codexEnabled||!c.updatedAt||now-c.updatedAt>900000);
  const rate=data.settings.creditUsdRate??0.04;
  const value=known?(c.unlimited?'不限量':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:8}).format(c.balance!)):'—';
  const amount=c?.balance==null?NaN:c.balance*rate;
  const usdValue=!known?'—':c.unlimited?'不限量':!Number.isFinite(amount)?'—':amount!==0&&Math.abs(amount)<0.01?(amount>0?'<$0.01':'>-$0.01'):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount);
  const useUsd=data.settings.creditsUnit!=='credits';
  return {known,stale,value,usdValue,rate,displayLabel:useUsd?'积分折合':'积分余额',displayValue:useUsd?usdValue:value,
    note:!c?'尚未获取积分余额':!known?'数据源未提供积分余额':`${c.source==='local_log'?'日志快照':'接口查询'} · ${timeLabel(c.updatedAt)}${stale?' · 待更新':''}`};
}
export const quotaName=(w:QuotaWindow)=>w.bucket==='codex'?'Codex 主额度':w.limitName?.trim()||(w.bucket==='codex_bengalfox'?'GPT-5.3-Codex-Spark':w.bucket);
export function quotaWindows(q:IntegrationSnapshot['quota']) {return q.windows.map(w=>({...w,updatedAt:w.updatedAt??q.updatedAt,source:w.source||q.source})).sort((a,b)=>Number(b.bucket==='codex')-Number(a.bucket==='codex')||a.bucket.localeCompare(b.bucket)||a.windowMinutes-b.windowMinutes);}
export function quotaObservation(w:QuotaWindow,now:number){return `${w.source==='local_log'?'日志快照':'接口查询'} · ${timeLabel(w.updatedAt??null)}${!w.updatedAt||now-w.updatedAt>900000||(w.resetsAt!==null&&now>=w.resetsAt)?' · 待更新':''}`;}
export function quotaFreshnessReason(w:QuotaWindow,now:number,enabled=true){
  if(!enabled)return '额度采集已暂停，显示上次记录。';
  if(!w.updatedAt)return '尚未取得额度的更新时间。';
  if(w.resetsAt!==null&&now>=w.resetsAt)return '已到额度重置时间，等待新快照确认剩余额度。';
  if(now-w.updatedAt>900000)return `最近一次额度更新于 ${timeLabel(w.updatedAt)}，距今 ${Math.floor((now-w.updatedAt)/60000)} 分钟；当前显示旧快照。`;
  return '';
}
export interface IntegrationSnapshot {
  settings:IntegrationSettings;today:TokenUsage;week:TokenUsage;days:Record<string,number>;models:Record<string,number>;
  tasks:{id:string;source:string;sessionId:string;turnId:string;status:string;updatedAt:number;tokens:number|null}[];
  quota:{windows:QuotaWindow[];credits?:Record<string,QuotaCredits>;updatedAt:number|null;source:string;error:string|null};
  balance:{configured:boolean;available:boolean|null;currency:string|null;total:number|null;granted:number|null;toppedUp:number|null;updatedAt:number|null;error:string|null;todayDecrease:number;history:{at:number;day:string;currency:string;total:number;decrease:number}[]};
  scanAt:number|null;scanError:string|null;scannedFiles:number;scanPending:boolean;scanProgress?:{eligibleFiles:number;completedFiles:number;skippedFiles:number;historyPending:boolean};detectedHome:string;bridgeFile:string;retainedRecords:number;
  demo?:AgentDemo|null;
  quotaRefresh?:{enabled:boolean;lastAttemptAt:number|null;nextAttemptAt:number|null;manualAvailableAt:number;failures:number};
  inbox?:InboxItem[];
  estimate?:Estimate;
  connection?:{testedAt:number|null;lastEventAt:number|null;lastSource:string|null}; senderScript?:string|null;
}
const zero={input:0,cached:0,output:0,reasoning:0,total:0};
export const emptyIntegrations:IntegrationSnapshot={settings:{codexEnabled:true,codexHome:'',codexExecutable:'',bridgeEnabled:false,deepseekEnabled:false,lowBalance:10,dailyBudget:10,notifyCompleted:true,notifyFailed:true,notifyApproval:true,completionTemplate:'{source} 的任务完成了 · {tokens}',showPetStatus:true,petLayout:'side',petMetric:'none'},today:zero,week:zero,days:{},models:{},tasks:[],quota:{windows:[],updatedAt:null,source:'',error:null},balance:{configured:false,available:null,currency:null,total:null,granted:null,toppedUp:null,updatedAt:null,error:null,todayDecrease:0,history:[]},scanAt:null,scanError:null,scannedFiles:0,scanPending:false,detectedHome:'',bridgeFile:'',retainedRecords:0};
export async function demoAgent(kind:string):Promise<AgentDemo|null>{if(desktop)return invoke('demo_agent',{kind});const demo=kind==='stop'?null:{id:crypto.randomUUID(),kind,expiresAt:Date.now()+10000};window.dispatchEvent(new CustomEvent('agent-demo-changed',{detail:demo}));return demo;}
export const getIntegrations=()=>desktop?invoke<IntegrationSnapshot>('get_integrations'):Promise.resolve(emptyIntegrations);
export async function integrationCommand(command:string,args:Record<string,unknown>):Promise<IntegrationSnapshot>{if(!desktop)throw new Error('请在桌面应用中配置连接，浏览器预览不读取本机 Agent 数据。');return invoke(command,args);}
export const numberLabel=(n:number)=>new Intl.NumberFormat('zh-CN').format(n);
export const compactNumber=(n:number)=>new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(n);
export const timeLabel=(at:number|null)=>at?new Date(at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'暂无数据';
export function quotaDuration(minutes:number){return minutes%1440===0?`${minutes/1440} 天`:minutes%60===0?`${minutes/60} 小时`:`${minutes} 分钟`;}
