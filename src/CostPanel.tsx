import { useState } from 'react';
import './costPanel.css';
import { desktop } from './platform/bridge';
import { compactNumber,estimateLabel,integrationCommand,timeLabel,type IntegrationSnapshot,type PriceRate } from './core/integrations';
import {missingReferenceRates,priceOrigin} from './core/priceOrigins';
type Draft={source:string;model:string;input:string;cached:string;output:string};
const editRows=(rates:PriceRate[]):Draft[]=>rates.map(r=>({...r,input:String(r.input),cached:String(r.cached),output:String(r.output)}));
export function CostPanel({data,onData}:{data:IntegrationSnapshot;onData:(v:IntegrationSnapshot)=>void}){
  const [draft,setDraft]=useState<Draft[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const e=data.estimate,rows=draft||editRows(e?.rates||[]);
  const missing=e?.models.filter(r=>r.total.unpriced>0)||[];
  const references=missingReferenceRates(e),spaceEnough=rows.length+references.length<=100;
  const update=(i:number,key:keyof Draft,value:string)=>setDraft(rows.map((r,j)=>i===j?{...r,[key]:value}:r));
  async function save(){setBusy(true);setError('');setMessage('');try{
    if(rows.some(r=>['input','cached','output'].some(k=>!r[k as keyof Draft].trim()||!Number.isFinite(Number(r[k as keyof Draft])))))throw new Error('请填写完整单价；免费项目请明确填写 0。');
    const rates=rows.map(r=>({...r,source:r.source.trim(),model:r.model.trim(),input:Number(r.input),cached:Number(r.cached),output:Number(r.output)}));
    const value=await integrationCommand('update_price_rates',{rates});onData(value);setDraft(null);setMessage('单价已保存，保留记录已按当前价格重新预估。');
  }catch(err){setError(String(err));}finally{setBusy(false);}}
  async function supplement(){setBusy(true);setError('');setMessage('');try{
    const value=await integrationCommand('supplement_price_rates',{});onData(value);setMessage('缺失参考价已补齐，保留记录已重新预估；已有单价保持不变。');
  }catch(err){setError(String(err));}finally{setBusy(false);}}
  return <section className="panel agent-panel cost-panel" aria-label="美元费用预估"><h2>美元费用预估 <small>本地折算 · 非实际扣款</small></h2>
    <div className="cost-totals"><div><span>今日预估</span><strong>{estimateLabel(e?.today)}</strong></div><div><span>近 7 天预估</span><strong>{estimateLabel(e?.week)}</strong></div></div>
    <p className="agent-note">按当前保存的单价重新计算保留记录。缓存输入单独计价，推理 token 已含在输出中；不代表 Pro 订阅账单或剩余美元额度。</p>
    {!!e?.today.unpriced&&<p className="agent-warning">今日 {e.today.unpriced} 条记录缺少单价{e.today.unpricedTokens!==undefined?`，共 ${compactNumber(e.today.unpricedTokens)} Token`:''}，对应费用尚未计入今日预估。</p>}
    {(data.scanPending||data.scanError)&&<p className="agent-warning">{data.scanPending?'近 7 天用量仍在补齐，金额尚未完整。':'采集异常，金额仅来自已保留的记录。'}</p>}
    {!!e&&(e.week.unpriced+e.week.invalid>0)&&<p className="agent-warning">近 7 天有 {e.week.unpriced} 条未匹配价格、{e.week.invalid} 条 token 明细不完整，未计入金额。显示“部分”的金额仅为已计价小计。</p>}
    {missing.length>0&&<p className="agent-note">缺少单价：{missing.map(r=>`${r.source} / ${r.model||'未知模型'}`).join('、')}。Token 已保留，补充单价后自动重算。内部标识（如 codex-auto-review）不推测实际模型价格。</p>}
    <div className="model-list">{e?.models.map(r=><div key={JSON.stringify([r.source,r.model])}><span>{r.source} / {r.model||'未知模型'}</span><strong>{estimateLabel(r.total)}</strong></div>)}</div>
    <details className="price-editor"><summary>配置模型单价（USD / 百万 token）</summary>
      <p className="agent-note">初始参考价：OpenAI 标准模式、短上下文；GPT-6.1 Sol 核对于 2026-09-30，GPT-6 Sol / Luna 核对于 2026-09-29，其余参考价核对于 2026-09-15。按来源和模型 ID 精确匹配；未提供价格的模型不推测。当前日志未区分长上下文、速度档位和缓存写入费用，也不含工具、图像、语音等额外费用。可按自己的计价假设修改。保存会重算全部保留记录。</p>
      <p className="agent-note">参考价版本 {e?.referenceVersion||'待确认'} · 标准模式、短上下文。内置与自定义价格标注在模型下方。</p>
      <fieldset disabled={!desktop||busy}>
      {references.length>0&&<div className="reference-supplement"><p>可补齐 {references.length} 项：{references.map(r=>r.model).join('、')}</p><button className="secondary-button" disabled={!!draft||!spaceEnough} onClick={()=>void supplement()}>补齐缺失参考价</button>{draft&&<small>先保存或取消当前修改，再补齐参考价。</small>}{!spaceEnough&&<small>最多 100 项，请先移除不需要的价格。</small>}</div>}
      <div className="price-scroll"><table><thead><tr><th>用量来源</th><th>模型 ID</th><th>输入</th><th>缓存输入</th><th>输出</th><th>操作</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{(['source','model','input','cached','output'] as const).map(k=><td key={k}><input aria-label={`价格 ${i+1} ${k}`} type={k==='source'||k==='model'?'text':'number'} min="0" max="1000000" step="any" value={r[k]} onChange={event=>update(i,k,event.target.value)}/>{k==='model'&&<small className={`price-origin ${priceOrigin(e,r).kind}`}>{priceOrigin(e,r).label}</small>}</td>)}<td><button className="text-button" aria-label={`移除价格 ${i+1}`} onClick={()=>setDraft(rows.filter((_,j)=>i!==j))}>移除</button></td></tr>)}</tbody></table></div>
      <div className="backup-actions"><button className="secondary-button" disabled={rows.length>=100} onClick={()=>setDraft([...rows,{source:'codex',model:'',input:'',cached:'',output:''}])}>添加模型价格</button><button className="primary-button" disabled={!draft} onClick={()=>void save()}>保存预估单价</button>{draft&&<button className="text-button" onClick={()=>{setDraft(null);setError('');}}>取消价格修改</button>}</div>
      </fieldset><p className="agent-note">{e?.updatedAt?`价格保存于 ${timeLabel(e.updatedAt)}`:'当前使用随版本提供的参考价。'} 补齐仅添加缺失项，已有价格保持不变；参考价随版本提供，不会联网刷新。</p>
    </details>
    <p className="agent-note">在下方“状态条附加指标”选择“今日美元预估”，即可常驻显示在桌宠下方。</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="agent-success">{message}</p>}
  </section>;
}
