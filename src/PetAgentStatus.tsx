import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ChevronRight, ArrowUpRight, X } from 'lucide-react';
import type { AgentPresentation } from './core/agentNotices';
import { petMetric } from './core/agentStatus';
import { compactNumber, quotaDuration, quotaName, quotaObservation, codexCredits, timeLabel, estimateLabel } from './core/integrations';
import { desktopAction } from './platform/bridge';
import { detailQuotas, summaryEstimate, summaryQuotas } from './core/petSummary';
import { QuotaRefreshNote } from './QuotaRefreshNote';

export function PetAgentStatus({agent,quiet,scale=1}:{agent:AgentPresentation;quiet:boolean;scale?:number}){
  const [open,setOpen]=useState(false);const {data,status,demo,clock}=agent;
  if(!data.settings.showPetStatus&&!demo)return null;
  const metric=petMetric(data,clock);
  const card=data.settings.petLayout!=='compact';const bottom=data.settings.petLayout==='bottom';const quotas=summaryQuotas(data,clock);const estimate=summaryEstimate(data.estimate?.today,bottom);
  const amount=bottom?estimate.value.replace(/^≈/,''):estimate.value;
  const credits=codexCredits(data,clock);
  const detail=detailQuotas(data,clock);
  const quotaRow=(w:(typeof detail.visible)[number])=><div key={`${w.bucket}:${w.label}`}><div className="pet-data-row"><span>{quotaName(w)} · {quotaDuration(w.windowMinutes)}</span><strong>{w.staleReason?'上次剩余':'剩余'} {(100-w.usedPercent).toFixed(0)}%</strong></div><p className="pet-data-note">{quotaObservation(w,clock)}{w.staleReason&&` · ${w.staleReason}`}</p></div>;
  const collection=data.scanPending?'补读中':data.scanError?'采集异常':!data.settings.codexEnabled?'采集暂停':'';
  return <div style={{zoom:scale}} className={`pet-agent-status ${card?'pet-side-panel':''} ${bottom?'pet-bottom-panel':''} status-${status.kind}`}>
    <button className="pet-status-trigger" aria-label="桌宠任务状态" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <i/><span title={`${status.source} ${status.label}`}>{(!card||bottom)&&status.source&&`${status.source==='codex'?'Codex':status.source} · `}{status.label}{status.count>1?` · ${status.count}`:''}{quiet?' · 免打扰':''}</span>{open?<ChevronUp size={14}/>:card?<ChevronRight size={14}/>:<ChevronDown size={12}/>}
    </button>
    {card?<button className="pet-summary" aria-label="展开常显用量详情" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className="pet-summary-quotas" aria-label="Codex 主额度">
        {quotas.length?quotas.map(w=><span className="pet-summary-quota" key={`${w.bucket}:${w.windowMinutes}`}>
          <span className="pet-summary-label">{w.label}</span><strong>{w.remaining.toFixed(0)}%</strong>
          <span className={`pet-quota-track ${w.stale?'is-stale':w.remaining<=10?'is-low':w.remaining<=20?'is-warning':''}`} role="progressbar" aria-label={`Codex ${w.label}`} aria-valuenow={w.remaining} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${w.remaining}%`}}/></span>
          {w.stale&&<span className="pet-summary-note" title={w.staleReason}>待更新</span>}
        </span>):<span className="pet-summary-quota is-empty"><span className="pet-summary-label">Codex 主额度</span><strong>—</strong><span className="pet-summary-note">暂无数据</span></span>}
      </span>
      <span className="pet-summary-metric"><span className="pet-summary-label">今日预估 {estimate.note&&estimate.note!=='部分计价'&&<span className="pet-summary-note">{estimate.note}</span>}</span><strong title={bottom?summaryEstimate(data.estimate?.today).value.replace(/^≈/,''):undefined} className={amount.length>12?'is-long':''}>{amount}</strong></span>
      <span className="pet-summary-metric"><span className="pet-summary-label">今日 Token</span><strong>{data.scanAt||data.retainedRecords?compactNumber(data.today.total):'—'}</strong>{collection&&<span className="pet-summary-note">{collection}</span>}</span>
      {data.settings.showPetCredits&&<span className="pet-summary-credits" title={`${credits.value} credits · 按 $${credits.rate}/credit 折算 · ${credits.note}`}><span>{credits.displayLabel}{credits.stale?' · 待更新':''}</span><strong>{credits.displayValue}</strong></span>}
    </button>:metric&&<div className="pet-status-metric" title={metric}>{metric}</div>}
    {open&&createPortal(<section className={`pet-agent-card ${bottom?'pet-detail-bottom':''}`} aria-label="桌宠用量详情">
      <header><strong>{demo?'联动演示':'任务与用量'}</strong><button aria-label="收起用量详情" onClick={()=>setOpen(false)}><X size={14}/></button></header>
      {demo?<p className="pet-data-note">演示还剩 {Math.min(10,Math.max(0,Math.ceil((demo.expiresAt-clock)/1000)))} 秒；下列数值仍是真实记录。</p>:<p className="pet-data-note">状态观察于 {timeLabel(status.updatedAt)}{data.scanPending?' · 历史补读中':''}</p>}
      {data.scanError&&<p className="pet-data-warning">采集暂不可用，显示保留记录。</p>}
      <div className="pet-data-row"><span>今日 token</span><strong>{data.scanAt||data.retainedRecords?compactNumber(data.today.total):'暂无数据'}</strong></div>
      <div className="pet-data-row"><span>今日美元预估</span><strong>{estimateLabel(data.estimate?.today)}</strong></div>
      {estimate.note==='部分计价'&&<p className="pet-data-note">部分计价：当前金额仅包含已成功计价的用量。</p>}
      <p className="pet-data-note">按所设单价折算，非账单或订阅扣款；完整明细见看板。</p>
      {quotas.some(w=>w.stale)&&<p className="pet-data-note">“待更新”表示额度快照较旧、已到重置时间或采集暂停。后台每 10 秒读取本地日志，并低频查询实时额度；查询失败时保留上次记录。</p>}
      <QuotaRefreshNote data={data} className="pet-data-note"/>
      {data.quota.error&&<p className="pet-data-warning">{data.quota.error}</p>}
      <details className="pet-credit-detail">
        <summary className="pet-data-row" aria-label="Codex 积分余额与换算说明">
          <span className="pet-disclosure-label">Codex 积分余额<ChevronDown size={12}/></span>
          <span className="pet-credit-values"><strong><span>{credits.value}</span>{credits.known&&credits.usdValue!=='不限量'&&<span className="pet-credit-unit">积分</span>}</strong>{credits.known&&credits.usdValue!=='不限量'&&<span className="pet-credit-equivalent">= <span>{credits.usdValue}</span></span>}</span>
        </summary>
        <p className="pet-data-note">{credits.note}。按 ${credits.rate}/credit 折算参考价值，非现金余额；今日费用预估不从积分中扣减。</p>
      </details>
      {data.quota.windows.length?<>{detail.visible.map(quotaRow)}{!!detail.older.length&&<details className="pet-older-quotas"><summary><span className="pet-disclosure-label">较早的附加额度（{detail.older.length}）<ChevronDown size={12}/></span></summary><p className="pet-data-note">以下是保留的旧快照，不代表当前可用额度。</p>{detail.older.map(quotaRow)}</details>}</>:<div className="pet-data-row"><span>Codex 额度</span><span>暂无数据</span></div>}
      <div className="pet-data-row"><span>DeepSeek</span><strong>{data.balance.total===null?'未获取余额':`${data.balance.currency} ${data.balance.total.toFixed(2)}`}</strong></div>
      {data.balance.updatedAt&&<p className="pet-data-note">余额更新于 {timeLabel(data.balance.updatedAt)}{data.balance.error||clock-data.balance.updatedAt>180000?' · 旧值':''}</p>}
      <button className="pet-dashboard-link" onClick={()=>void desktopAction('agent-dashboard')}>打开完整看板<ArrowUpRight size={13}/></button>
      {!!data.inbox?.some(i=>!i.read)&&<button className="pet-dashboard-link" onClick={()=>void desktopAction('inbox')}>未读提醒 {data.inbox.filter(i=>!i.read).length} 条<ArrowUpRight size={13}/></button>}
    </section>,document.querySelector('.desktop-pet')||document.body)}
  </div>;
}
