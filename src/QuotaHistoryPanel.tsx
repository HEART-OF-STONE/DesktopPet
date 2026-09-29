import {useState} from 'react';
import {timeLabel,type IntegrationSnapshot} from './core/integrations';
import './quotaHistory.css';

const money=(v:number|null)=>v===null?'—':v>0&&v<0.01?'<$0.01':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:v<100?2:0}).format(v);
const percent=(v:number|null)=>v===null?'无记录':`${Number(v.toFixed(1))}%`;
export function QuotaHistoryPanel({data}:{data:IntegrationSnapshot}){
  const [range,setRange]=useState(7),[selected,setSelected]=useState<string|null>(null);
  const h=data.quotaHistory,days=h?.days.slice(0,range)||[],active=days.find(d=>d.day===selected)||days[1]||days[0],e=h?.estimate;
  return <section className="panel agent-panel quota-history" aria-label="周额度历史与估算">
    <div className="quota-history-heading"><div><h2>周额度历史</h2><p className="agent-note">Codex 主额度 · 每天最后一次观测</p></div><label>查看范围<select aria-label="额度历史范围" value={range} onChange={ev=>setRange(Number(ev.target.value))}><option value={7}>近 7 天</option><option value={14}>近 14 天</option><option value={30}>近 30 天</option></select></label></div>
    <div className="quota-history-chart" aria-label="每日周额度剩余">{[...days].reverse().map((d,i)=><button type="button" key={d.day} className={`quota-history-day${active?.day===d.day?' is-selected':''}${d.remaining===null?' is-missing':''}`} aria-pressed={active?.day===d.day} aria-label={`${d.day} 周剩余 ${percent(d.remaining)}`} title={`${d.day} · ${percent(d.remaining)}${d.observedAt?` · 观测于 ${timeLabel(d.observedAt)}`:''}`} onClick={()=>setSelected(d.day)}><span className="quota-history-track"><span style={{height:d.remaining===null?undefined:`${Math.max(1,d.remaining)}%`}}/></span><small>{range<=7||i%5===0||i===days.length-1?d.day.slice(5):'·'}</small></button>)}</div>
    {active?<div className="quota-day-detail" aria-live="polite"><div><small>{active.day} · 周剩余</small><strong>{percent(active.remaining)}</strong></div><p>{active.observedAt?<>观测于 {timeLabel(active.observedAt)}<br/>{active.source==='app_server'?'接口查询':'日志快照'}{active.resetsAt?` · 当时的重置时间 ${timeLabel(active.resetsAt)}`:''}</>:'当天未保存有效快照，不从 Token 数倒推额度。'}</p></div>:<p className="agent-note">尚未开始记录额度历史。</p>}
    {h&&!h.backfill.done&&<p className="agent-note" role="status">{data.settings.codexEnabled?`正在快速补入旧快照 · ${h.backfill.completed} / ${h.backfill.total||'待发现'} 个会话`:'额度采集已暂停，保留已有历史。'}</p>}
    {h?.backfill.error&&<p className="agent-warning">{h.backfill.error}</p>}
    <details><summary>逐日明细与记录说明</summary><p className="agent-note">记录时间以本地日期为准，不代表午夜结算。旧日志仅快速补入近 30 天最新 128 个会话的尾部快照，可能不完整；无记录的日期不会延用前一天的数值。</p><div className="quota-history-table"><table><thead><tr><th>日期</th><th>周剩余</th><th>最后观测</th></tr></thead><tbody>{days.map(d=><tr key={d.day}><td>{d.day}</td><td>{percent(d.remaining)}</td><td>{d.observedAt?timeLabel(d.observedAt):'—'}</td></tr>)}</tbody></table></div></details>
    <div className="quota-estimate"><h3>本周期美元等值估算 <span>仅供参考</span></h3>
      {e?.totalUsd!=null?<><div className="quota-estimate-metrics"><div><small>整周额度等值</small><strong>约 {money(e.totalUsd)}</strong></div><div><small>剩余额度等值</small><strong>约 {money(e.remainingUsd)}</strong></div></div><p className="agent-note">{e.sampleCount} 段有效样本 · 累计下降 {Number(e.dropPercent.toFixed(1))} 个百分点 · 样本用量估值 {money(e.sampleUsd)}<br/>观测区间 {timeLabel(e.from)} — {timeLabel(e.to)}</p></>:<p className="quota-estimate-empty">{e?.reason||'正在积累有效样本'}</p>}
      <p className="agent-note">按本机已记录用量外推，仅供参考，不代表官方美元额度或可提现余额。其他设备用量、模型组合、速度档位及采集延迟会影响结果。</p>
      <details><summary>估算方法与样本要求</summary><p className="agent-note">完整计价用量 ÷ 同期周额度下降比例 = 整周参考等值。只使用启用此功能后、同一重置周期的样本；每段至少 5 分钟且下降 2 个百分点，至少 3 段、合计下降 6 个百分点后显示结果。跨重置、额度回升、超过 2 小时未观测、缺价或不完整用量均排除。样本差异过大时暂停外推；旧快照仅供历史查看，不参与首次估算。{e?.excluded?` 已排除 ${e.excluded} 段。`:''}</p></details>
    </div>
  </section>;
}
