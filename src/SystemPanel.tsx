import { useEffect,useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { desktop } from './platform/bridge';
interface Status {version:string;startupEnabled:boolean;startupMatches:boolean;updates:{repository:string;checkedAt:number|null;latest:{version:string;title:string;notes:string;newer:boolean}|null;error:string|null}}
export function SystemPanel(){
  const [data,setData]=useState<Status|null>(null);const [repo,setRepo]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  useEffect(()=>{if(desktop)void invoke<Status>('get_system_status').then(d=>{setData(d);setRepo(d.updates.repository);}).catch(e=>setError(String(e)));},[]);
  async function run(command:string,args:Record<string,unknown>,text:string){setBusy(true);setError('');setMessage('');try{const d=await invoke<Status>(command,args);setData(d);setRepo(d.updates.repository);setMessage(text);}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="panel system-panel" aria-label="启动与更新"><h2>启动与更新</h2><div className="setting-row"><div><strong>登录 Windows 时启动</strong><p>启动桌宠并驻留托盘，不主动打开管理面板。仅对当前 Windows 用户生效。</p></div><button role="switch" aria-label="开机启动" aria-checked={data?.startupEnabled||false} className={`toggle ${data?.startupEnabled?'on':''}`} disabled={!desktop||busy||!data} onClick={()=>void run('set_startup',{enabled:!data?.startupEnabled},data?.startupEnabled?'已关闭开机启动':'已开启开机启动')}><span/></button></div>
    {data?.startupEnabled&&!data.startupMatches&&<p className="agent-warning">启动项仍指向旧位置。<button className="text-button" disabled={busy} onClick={()=>void run('set_startup',{enabled:true},'启动位置已更新')}>更新启动位置</button></p>}
    <div className="setting-row"><div><strong>版本 {data?.version||'0.8.0'}</strong><p>手动检查发布版本，不会自动下载或安装。建议升级前先导出备份。</p></div><button className="secondary-button" disabled={!desktop||busy||!data?.updates.repository} onClick={()=>void run('check_update',{},'检查完成，请查看版本结果。')}>{busy?'处理中…':'检查更新'}</button></div>
    {!data?.updates.repository&&<p className="agent-note">尚未配置发布仓库，当前不会联网检查更新。</p>}
    {data?.updates.checkedAt&&<p className="agent-note">上次检查：{new Date(data.updates.checkedAt).toLocaleString('zh-CN')}</p>}
    {data?.updates.error&&<p className="agent-warning">{data.updates.error}；下方如有版本信息，为上次成功结果。</p>}
    {data?.updates.latest&&<div className="release-result"><strong>{data.updates.latest.newer?`发现新版本 ${data.updates.latest.version}`:'未发现比当前更新的稳定版本'}</strong><p>{data.updates.latest.title}</p><details><summary>发布说明</summary><pre>{data.updates.latest.notes||'发布者未填写说明。'}</pre></details><button className="secondary-button" onClick={()=>void invoke('open_release_page').catch(e=>setError(String(e)))}>打开发布页</button></div>}
    <details className="update-source"><summary>更新来源</summary><p className="agent-note">使用项目发布者提供的公开 GitHub 仓库。此处不需要访问令牌，不填写个人 API Key。</p><label>发布仓库<input aria-label="更新发布仓库" value={repo} disabled={!desktop||busy} placeholder="所有者/仓库名" onChange={e=>setRepo(e.target.value)}/></label><button className="secondary-button" disabled={!desktop||busy||repo===(data?.updates.repository||'')} onClick={()=>void run('set_update_source',{repository:repo},'更新来源已保存')}>保存更新来源</button></details>
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="agent-success">{message}</p>}
  </section>;
}
