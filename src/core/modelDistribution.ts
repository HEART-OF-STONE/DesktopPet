import type {Estimate,TodayModel} from './integrations';
export {usdAmount as modelAmount} from './integrations';

export type ModelMetric='cost'|'tokens';
export interface ModelShare {key:string;name:string;value:number;share:number|null;members:string[]}
export function modelName(m:Pick<TodayModel,'source'|'model'>):string{
  const name=m.model.replace(/^gpt-(\d+(?:\.\d+)?)-(astra|sol|luna|terra)$/,'GPT-$1 $2').replace(/ (astra|sol|luna|terra)$/,(s)=>s[0]+s[1].toUpperCase()+s.slice(2));
  return m.source==='codex'?name:`${m.source} / ${name}`;
}
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function modelDistribution(estimate:Estimate|undefined,metric:ModelMetric){
  // The legacy models array covers seven days; never use it for today's shares.
  const models=estimate?.todayModels??[];
  const entries=models.filter(m=>valid(metric==='cost'?m.total.usd:m.tokens.total)).map(m=>({key:JSON.stringify([m.source,m.model]),name:modelName(m),value:(metric==='cost'?m.total.usd:m.tokens.total)!,members:[`${m.source} / ${m.model}`]}))
    .sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key));
  const total=entries.reduce((sum,m)=>sum+m.value,0);
  const head=entries.slice(0,3),tail=entries.slice(3);
  if(tail.length)head.push({key:'other',name:`其他（${tail.length}）`,value:tail.reduce((sum,m)=>sum+m.value,0),members:tail.flatMap(m=>m.members)});
  const rows:ModelShare[]=head.map(m=>({...m,share:total>0?m.value/total:null}));
  return {rows,total,unpriced:models.filter(m=>m.total.unpriced>0),invalid:models.filter(m=>m.total.invalid>0),hasData:models.length>0};
}
export function shareLabel(share:number|null){return share===null?'—':share>0&&share<0.001?'<0.1%':`${(share*100).toLocaleString('en-US',{maximumFractionDigits:1})}%`;}
