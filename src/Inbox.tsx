import { useState } from 'react';
import { CheckCheck, Mail, Trash2 } from 'lucide-react';
import { integrationCommand,timeLabel,type IntegrationSnapshot } from './core/integrations';
import { desktop } from './platform/bridge';
export function Inbox({data,onDashboard}:{data:IntegrationSnapshot;onDashboard:()=>void}){
  const [filter,setFilter]=useState('unread');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const all=data.inbox||[];const unread=all.filter(i=>!i.read).length;const items=all.filter(i=>filter==='all'||filter==='unread'&&!i.read||filter==='attention'&&['failed','waiting','balance'].includes(i.kind)).slice().reverse();
  async function act(action:string,id?:string){setBusy(true);try{await integrationCommand('update_inbox',{action,id:id||null});setError('');}catch(e){setError(String(e));}finally{setBusy(false);}}
  const labels:Record<string,string>={completed:'完成',failed:'失败',waiting:'待确认',balance:'余额提醒'};
  return <section className="panel inbox-panel" aria-label="提醒收件箱"><div className="inbox-toolbar"><div className="inbox-filters">{[['unread',`未读 ${unread}`],['all','全部'],['attention','需要关注']].map(([value,label])=><button key={value} aria-pressed={filter===value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><button className="text-button" disabled={!desktop||busy||!unread} onClick={()=>void act('read-all')}><CheckCheck size={14}/>全部已读</button><button className="text-button" disabled={!desktop||busy||!all.some(i=>i.read)} onClick={()=>void act('clear-read')}><Trash2 size={14}/>清理已读</button></div>
    <p className="agent-note">保留最近 90 天内最多 300 条真实提醒。免打扰关闭气泡和声音，消息仍会入箱；演示不入箱。关闭某类任务提醒后，该类新消息不再记录。</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <div className="inbox-list">{items.map(i=><article key={i.id} className={`inbox-item ${i.read?'read':'unread'}`}><span className={`task-state ${i.kind}`}>{labels[i.kind]||'提醒'}</span><div><strong>{i.source}</strong><p>{i.text}</p><small>{timeLabel(i.at)}</small></div><button className="secondary-button" disabled={busy} onClick={()=>void act(i.read?'unread':'read',i.id)}>{i.read?'标为未读':'标为已读'}</button></article>)}</div>
    {!items.length&&<div className="inbox-empty"><Mail size={28}/><p>{filter==='unread'?'暂时没有未读提醒':'这里还没有提醒'}</p></div>}
    <button className="secondary-button" onClick={onDashboard}>查看 Agent 看板</button>
  </section>;
}
