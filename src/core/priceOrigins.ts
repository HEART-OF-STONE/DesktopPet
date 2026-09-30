import type {Estimate,PriceRate} from './integrations';
type Row={source:string;model:string;input:string;cached:string;output:string};
export function missingReferenceRates(e?:Estimate){return e?.referenceRates?.filter(r=>!e.rates.some(p=>p.source===r.source&&p.model===r.model))||[];}
export function priceOrigin(e:Estimate|undefined,row:Row){
 const saved=e?.rates.find(r=>r.source===row.source&&r.model===row.model);
 const changed=!saved||(['input','cached','output'] as const).some(k=>!row[k].trim()||Number(row[k])!==saved[k]);
 if(changed)return {kind:'custom',label:'自定义 · 未保存'};
 const origin=e?.rateOrigins?.find(r=>r.source===row.source&&r.model===row.model);
 if(!origin)return {kind:'unknown',label:'来源待确认'};
 return {kind:origin.kind,label:origin.kind==='reference'?`内置参考价${origin.checkedOn?` · ${origin.checkedOn.slice(5)}`:''}`:'自定义价格'};
}
