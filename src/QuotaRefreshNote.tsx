import { timeLabel, type IntegrationSnapshot } from './core/integrations';

export function QuotaRefreshNote({data,className='agent-note'}:{data:IntegrationSnapshot;className?:string}){
  const refresh=data.quotaRefresh;
  if(!refresh)return null;
  return <p className={className}>
    {refresh.enabled?<>自动查询：最多每 10 分钟一次；日志额度较新时延后。<br/>
      {refresh.failures>0?'查询未成功，已降低重试频率。下次重试：':'下次自动检查：'}{timeLabel(refresh.nextAttemptAt)}
      {refresh.lastAttemptAt&&<> · 上次尝试 {timeLabel(refresh.lastAttemptAt)}</>}
    </>:'自动额度查询已暂停。开启 Codex 采集后恢复。'}
  </p>;
}
