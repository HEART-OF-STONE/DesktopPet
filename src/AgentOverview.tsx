import {Activity} from 'lucide-react';
import {compactNumber,numberLabel as n,quotaWindows,quotaName,quotaDuration,quotaObservation,timeLabel,type IntegrationSnapshot,type QuotaWindow} from './core/integrations';
import {QuotaRefreshNote} from './QuotaRefreshNote';
import {desktop} from './platform/bridge';
import './agentDashboard.css';

export function AgentOverview({data,busy,onRefresh}:{data:IntegrationSnapshot;busy:boolean;onRefresh:()=>void}){
  const today=new Date().toLocaleDateString('sv-SE');
  const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return d.toLocaleDateString('sv-SE');});
  const max=Math.max(1,...days.map(d=>data.days[d]||0));
  const windows=quotaWindows(data.quota),main=windows.filter(w=>w.bucket==='codex'),extra=windows.filter(w=>w.bucket!=='codex');
  const cooling=(data.quotaRefresh?.manualAvailableAt||0)>Date.now();
  return <div className="agent-columns agent-overview">
    <section className="panel agent-panel" aria-label="近 7 天用量"><h2><Activity size={18}/>近 7 天用量</h2>
      <div className="usage-chart" aria-label="近七天 token 柱状图">{days.map(day=><div key={day} className={day===today?'today':''}><span title={`${n(data.days[day]||0)} tokens`}>{compactNumber(data.days[day]||0)}</span><i style={{height:`${Math.max(2,(data.days[day]||0)/max*80)}px`}}/><small>{day.slice(5)}</small></div>)}</div>
      <p className="agent-note">今日输入 {compactNumber(data.today.input)} · 输出 {compactNumber(data.today.output)}</p>
      <details><summary>模型与 Token 明细</summary><p className="agent-note">今日输入 {n(data.today.input)} · 输出 {n(data.today.output)}<br/>其中缓存 {n(data.today.cached)} · 推理 {n(data.today.reasoning)}（已包含，不重复相加）</p><div className="model-list">{Object.entries(data.models).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([model,total])=><div key={model}><span title={model}>{model}</span><strong>{n(total)}</strong></div>)}{!Object.keys(data.models).length&&<p className="agent-empty">连接后显示模型分布。</p>}</div></details>
    </section>
    <section className="panel agent-panel" aria-label="Codex 订阅额度"><h2>Codex 订阅额度</h2>
      {main.map(w=><WindowRow key={`${w.bucket}:${w.label}`} window={w}/>)}
      {!main.length&&<p className="agent-empty">暂无主额度快照，等待 Codex 返回数据。</p>}
      {data.quota.error&&<p className="agent-warning">{data.quota.error}</p>}
      <div className="quota-overview-footer"><span>{data.quotaRefresh?.enabled?'自动更新 · 至多每 10 分钟':'自动查询已暂停'}</span><button className="text-button" disabled={busy||!desktop||!data.settings.codexEnabled||cooling} onClick={onRefresh}>{cooling?'查询冷却中':'刷新额度'}</button></div>
      <details><summary>查询说明{extra.length?`与附加额度（${extra.length}）`:''}</summary><QuotaRefreshNote data={data}/><p className="agent-note">仅展示实际返回的窗口，各项更新时间独立；未返回的额度不推算。</p>{extra.map(w=><WindowRow key={`${w.bucket}:${w.label}`} window={w}/>)}</details>
    </section>
  </div>;
}
function WindowRow({window:w}:{window:QuotaWindow}){const remaining=Math.max(0,Math.min(100,100-w.usedPercent));return <div className="quota-window"><div><span>{w.bucket==='codex'?'主额度':quotaName(w)} · {quotaDuration(w.windowMinutes)}</span><strong>剩余 {remaining.toFixed(0)}%</strong></div><progress max="100" value={remaining} aria-label={`${quotaName(w)} ${quotaDuration(w.windowMinutes)}剩余额度`}/><small>{quotaObservation(w,Date.now())}<br/>重置于 {timeLabel(w.resetsAt)}</small></div>;}
