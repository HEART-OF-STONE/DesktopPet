import { useState } from 'react';
import './costPanel.css';
import { desktop } from './platform/bridge';
import { estimateLabel,integrationCommand,timeLabel,type IntegrationSnapshot,type PriceRate } from './core/integrations';
type Draft={source:string;model:string;input:string;cached:string;output:string};
const editRows=(rates:PriceRate[]):Draft[]=>rates.map(r=>({...r,input:String(r.input),cached:String(r.cached),output:String(r.output)}));
export function CostPanel({data,onData}:{data:IntegrationSnapshot;onData:(v:IntegrationSnapshot)=>void}){
  const [draft,setDraft]=useState<Draft[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const e=data.estimate,rows=draft||editRows(e?.rates||[]);
  const update=(i:number,key:keyof Draft,value:string)=>setDraft(rows.map((r,j)=>i===j?{...r,[key]:value}:r));
  async function save(){setBusy(true);setError('');setMessage('');try{
    if(rows.some(r=>['input','cached','output'].some(k=>!r[k as keyof Draft].trim()||!Number.isFinite(Number(r[k as keyof Draft])))))throw new Error('请填写完整单价；免费项目请明确填写 0。');
    const rates=rows.map(r=>({...r,source:r.source.trim(),model:r.model.trim(),input:Number(r.input),cached:Number(r.cached),output:Number(r.output)}));
    const value=await integrationCommand('update_price_rates',{rates});onData(value);setDraft(null);setMessage('单价已保存，保留记录已按当前价格重新预估。');
  }catch(err){setError(String(err));}finally{setBusy(false);}}
  return <section className="panel agent-panel cost-panel" aria-label="美元费用预估"><h2>美元费用预估 <small>本地折算 · 非实际扣款</small></h2>
    <div className="cost-totals"><div><span>今日预估</span><strong>{estimateLabel(e?.today)}</strong></div><div><span>近 7 天预估</span><strong>{estimateLabel(e?.week)}</strong></div></div>
    <p className="agent-note">按当前保存的单价重新计算保留记录。缓存输入单独计价，推理 token 已含在输出中；不代表 Pro 订阅账单或剩余美元额度。</p>
    {(data.scanPending||data.scanError)&&<p className="agent-warning">{data.scanPending?'近 7 天用量仍在补齐，金额尚未完整。':'采集异常，金额仅来自已保留的记录。'}</p>}
    {!!e&&(e.week.unpriced+e.week.invalid>0)&&<p className="agent-warning">近 7 天有 {e.week.unpriced} 条未匹配价格、{e.week.invalid} 条 token 明细不完整，未计入金额。显示“部分”的金额仅为已计价小计。</p>}
    <div className="model-list">{e?.models.map(r=><div key={JSON.stringify([r.source,r.model])}><span>{r.source} / {r.model||'未知模型'}</span><strong>{estimateLabel(r.total)}</strong></div>)}</div>
    <details className="price-editor"><summary>配置模型单价（USD / 百万 token）</summary>
      <p className="agent-note">初始参考价：OpenAI 标准模式、短上下文，核对于 2026-09-15。按来源和模型 ID 精确匹配；未提供价格的模型不推测。当前日志未区分长上下文、速度档位和缓存写入费用，也不含工具、图像、语音等额外费用。可按自己的计价假设修改。保存会重算全部保留记录。</p>
      <fieldset disabled={!desktop||busy}><div className="price-scroll"><table><thead><tr><th>来源</th><th>模型 ID</th><th>输入</th><th>缓存输入</th><th>输出</th><th>操作</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{(['source','model','input','cached','output'] as const).map(k=><td key={k}><input aria-label={`价格 ${i+1} ${k}`} type={k==='source'||k==='model'?'text':'number'} min="0" max="1000000" step="any" value={r[k]} onChange={event=>update(i,k,event.target.value)}/></td>)}<td><button className="text-button" aria-label={`移除价格 ${i+1}`} onClick={()=>setDraft(rows.filter((_,j)=>i!==j))}>移除</button></td></tr>)}</tbody></table></div>
      <div className="backup-actions"><button className="secondary-button" disabled={rows.length>=100} onClick={()=>setDraft([...rows,{source:'codex',model:'',input:'',cached:'',output:''}])}>添加模型价格</button><button className="primary-button" disabled={!draft} onClick={()=>void save()}>保存预估单价</button>{draft&&<button className="text-button" onClick={()=>{setDraft(null);setError('');}}>取消价格修改</button>}</div>
      </fieldset><p className="agent-note">{e?.updatedAt?`价格保存于 ${timeLabel(e.updatedAt)}`:'当前使用随版本提供的参考价，不会联网更新价格。'}</p>
    </details>
    <p className="agent-note">在下方“状态条附加指标”选择“今日美元预估”，即可常驻显示在桌宠下方。</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="agent-success">{message}</p>}
  </section>;
}
