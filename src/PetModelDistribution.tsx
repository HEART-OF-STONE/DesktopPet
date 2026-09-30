import {useState} from 'react';
import {compactNumber,type Estimate,type TodayModel} from './core/integrations';
import {modelAmount,modelDistribution,modelName,shareLabel,type ModelMetric} from './core/modelDistribution';
import './modelDistribution.css';

const COLORS=['#617556','#94a987','#cfd8c5','#b4bcae'];
function missingNames(models:TodayModel[]){return models.slice(0,2).map(modelName).join('、')+(models.length>2?` 等 ${models.length} 个模型`:'');}
export function PetModelDistribution({estimate}:{estimate?:Estimate}){
  const [metric,setMetric]=useState<ModelMetric>('cost');
  const d=modelDistribution(estimate,metric);
  return <section className="pet-model-distribution" aria-label="今日模型占比">
    <div className="pet-model-heading"><h3>今日模型{metric==='cost'?'费用':'用量'}</h3><div className="pet-model-switch" aria-label="占比统计方式"><button aria-label="按费用查看模型占比" aria-pressed={metric==='cost'} onClick={()=>setMetric('cost')}>费用</button><span aria-hidden="true">/</span><button aria-label="按 Token 查看模型占比" aria-pressed={metric==='tokens'} onClick={()=>setMetric('tokens')}>Token</button></div></div>
    {d.total>0&&<div className="pet-model-bar" role="img" aria-label={`${metric==='cost'?'已计价金额':'已记录 Token'}占比：${d.rows.map(m=>`${m.name} ${shareLabel(m.share)}`).join('，')}`}>
      {d.rows.filter(m=>m.value>0).map(m=><span key={m.key} style={{width:`${m.share!*100}%`,background:COLORS[d.rows.indexOf(m)]}} title={`${m.name} ${shareLabel(m.share)}`}/>)}</div>}
    {!!d.rows.length&&<ul className="pet-model-list">{d.rows.map((m,i)=><li key={m.key}><span className="pet-model-name" title={m.members.join('、')}><i style={{background:COLORS[i]}} aria-hidden="true"/>{m.name}</span><span className="pet-model-amount" title={metric==='cost'?modelAmount(m.value):`${m.value.toLocaleString('en-US')} Token`}>{metric==='cost'?modelAmount(m.value):compactNumber(m.value)}</span><span className="pet-model-share">{shareLabel(m.share)}</span></li>)}</ul>}
    {!d.hasData?<p className="pet-data-note">暂无今日模型明细。</p>:<>
      {!!d.unpriced.length&&<p className="pet-model-missing" title={d.unpriced.map(m=>`${m.source} / ${m.model}`).join('、')}>未计价：{missingNames(d.unpriced)}。</p>}
      {!!d.invalid.length&&<p className="pet-model-missing">{d.invalid.reduce((n,m)=>n+m.total.invalid,0)} 条明细不完整，未计入金额。</p>}
      <p className="pet-model-caption">{metric==='cost'?(d.total>0?'已计价金额占比，未计价记录未计入。':'暂无可计算的金额占比，可切换 Token 查看。'):'已记录 Token 占比；缓存与推理不重复累加。'}</p>
    </>}
  </section>;
}
