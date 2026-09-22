import {quotaDuration,quotaWindows,quotaFreshnessReason,compactNumber,type IntegrationSnapshot,type EstimateTotal} from './integrations';

// Only the main quota belongs in the permanent panel; Spark stays in details.
export function summaryQuotas(data:IntegrationSnapshot,now:number){
  return quotaWindows(data.quota).filter(w=>w.bucket==='codex').sort((a,b)=>(a.windowMinutes===10080?-1:b.windowMinutes===10080?1:a.windowMinutes-b.windowMinutes)).map(w=>({
    ...w,label:w.windowMinutes===10080?'周剩余':w.windowMinutes===300?'5h 剩余':`${quotaDuration(w.windowMinutes)}剩余`,
    remaining:Math.max(0,Math.min(100,100-w.usedPercent)),
    stale:!data.settings.codexEnabled||!w.updatedAt||now-w.updatedAt>900000||(w.resetsAt!==null&&now>=w.resetsAt),
    staleReason:quotaFreshnessReason(w,now,data.settings.codexEnabled),
  }));
}
export function summaryEstimate(t?:EstimateTotal,compactLarge=false){
  if(!t||!t.records)return {value:'—',note:'暂无记录'};
  if(t.usd===null)return {value:'—',note:'未计价'};
  if(compactLarge&&t.usd>=1000000)return {value:`≈$${compactNumber(t.usd)}`,note:t.unpriced+t.invalid?'部分计价':''};
  return {value:t.usd>0&&t.usd<0.01?'<$0.01':`≈$${t.usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`,note:t.unpriced+t.invalid?'部分计价':''};
}

// Main quotas stay visible even when stale; only old supplementary snapshots fold away.
export function detailQuotas(data:IntegrationSnapshot,now:number){
  const windows=quotaWindows(data.quota).map(w=>({...w,staleReason:quotaFreshnessReason(w,now,data.settings.codexEnabled)}));
  return {
    visible:windows.filter(w=>w.bucket==='codex'||!w.staleReason),
    older:windows.filter(w=>w.bucket!=='codex'&&!!w.staleReason),
  };
}
