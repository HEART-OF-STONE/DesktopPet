import { useEffect,useRef,useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download,Upload,Undo2 } from 'lucide-react';
import { desktop } from './platform/bridge';
interface Preview {createdAt:number;roles:{id:string;name:string}[];petName:string|null;selectedId:string}
export function BackupPanel(){
  const input=useRef<HTMLInputElement>(null);const [pending,setPending]=useState<{text:string;preview:Preview}|null>(null);const [busy,setBusy]=useState(false);const [canUndo,setCanUndo]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  useEffect(()=>{if(desktop)void invoke<boolean>('backup_status').then(setCanUndo).catch(e=>setError(String(e)));},[]);
  async function run(work:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function exportFile(){const data=await invoke('export_backup');const blob=new Blob([JSON.stringify(data)],{type:'application/json'});if(blob.size>32*1024*1024)throw new Error('备份超过 32 MB，请先移除不需要的角色。');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`desktop-pet-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('已生成备份，请妥善保存下载的 JSON 文件。');}
  async function inspect(file:File){setPending(null);if(file.size>32*1024*1024)throw new Error('备份不能超过 32 MB');const text=await file.text();const preview=await invoke<Preview>('preview_backup',{text});setPending({text,preview});}
  return <section className="panel backup-panel" aria-label="备份与恢复"><h2>备份与恢复</h2><p className="agent-note">完整备份包含导入角色的图片、皮肤、名字和偏好。不包含 API Key、Agent 日志、收件箱、余额、开机启动或更新来源。</p>
    <div className="backup-actions"><button className="secondary-button" disabled={!desktop||busy} onClick={()=>void run(exportFile)}><Download size={15}/>导出完整备份</button><button className="secondary-button" disabled={!desktop||busy} onClick={()=>input.current?.click()}><Upload size={15}/>选择备份文件</button><button className="text-button" disabled={!desktop||busy||!canUndo} onClick={()=>void run(async()=>{await invoke('undo_restore');setPending(null);setMessage('已撤销上次恢复，当前计时继续保留。');})}><Undo2 size={15}/>撤销上次恢复</button></div>
    <input ref={input} className="visually-hidden" type="file" accept=".json" aria-label="选择完整备份 JSON" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void run(()=>inspect(f));}}/>
    {pending&&<div className="backup-review" role="region" aria-label="备份恢复预览"><h3>确认这份备份</h3><p>备份时间：{new Date(pending.preview.createdAt).toLocaleString('zh-CN')}</p><p>导入角色：{pending.preview.roles.length} 个{pending.preview.roles.length?`（${pending.preview.roles.map(r=>r.name).join('、')}）`:''}</p><p>当前角色：{pending.preview.petName||pending.preview.selectedId}</p><p>恢复会替换现有导入角色和偏好。当前计时、联动记录及账户配置保持原样，恢复前会自动保存一个本机还原点。</p><div className="backup-actions"><button className="primary-button" disabled={busy} onClick={()=>void run(async()=>{await invoke('restore_backup',{text:pending.text});setPending(null);setCanUndo(true);setMessage('角色与偏好已恢复，可以撤销本次恢复。');})}>确认恢复</button><button className="secondary-button" disabled={busy} onClick={()=>setPending(null)}>取消</button></div></div>}
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="agent-success">{message}</p>}{!desktop&&<p className="agent-note">请在桌面应用中备份与恢复。</p>}
  </section>;
}
