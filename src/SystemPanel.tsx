import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { desktop } from './platform/bridge';
import './systemPanel.css';

interface Status {
  version: string; startupEnabled: boolean; startupMatches: boolean; officialRepository: string;
  updates: { repository: string; automatic: boolean; checkedAt: number | null; latest: { version: string; title: string; notes: string; newer: boolean } | null; error: string | null };
  transfer: { phase: string; downloaded: number; total: number | null; message: string | null };
}
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function SystemPanel() {
  const [data, setData] = useState<Status | null>(null);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const listening = listen<Status>('system-status-changed', event => { if (!disposed) setData(event.payload); });
    void listening.then(() => invoke<Status>('get_system_status')).then(d => { if (!disposed) { setData(d); setRepo(d.updates.repository); } }).catch(e => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; void listening.then(stop => stop()).catch(() => {}); };
  }, []);
  async function run(command: string, args: Record<string, unknown>, text = '') {
    setBusy(true); setError(''); setMessage('');
    try { const d = await invoke<Status>(command, args); setData(d); if (command === 'set_update_source') setRepo(d.updates.repository); setMessage(text); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  const phase = data?.transfer.phase;
  const working = busy || ['checking', 'downloading', 'verifying', 'installing'].includes(phase || '');
  const disabled = !desktop || !data || working;
  const official = data?.updates.repository === data?.officialRepository;
  const total = data?.transfer.total, downloaded = data?.transfer.downloaded || 0;
  return <section className="panel system-panel" aria-label="启动与更新">
    <h2>启动与更新</h2>
    <div className="setting-row"><div><strong>登录 Windows 时启动</strong><p>启动桌宠并驻留托盘，不主动打开管理面板。仅对当前 Windows 用户生效。</p></div><button role="switch" aria-label="开机启动" aria-checked={data?.startupEnabled || false} className={`toggle ${data?.startupEnabled ? 'on' : ''}`} disabled={disabled} onClick={() => void run('set_startup', { enabled: !data?.startupEnabled }, data?.startupEnabled ? '已关闭开机启动' : '已开启开机启动')}><span /></button></div>
    {data?.startupEnabled && !data.startupMatches && <p className="agent-warning">启动项仍指向旧位置。<button className="text-button" disabled={disabled} onClick={() => void run('set_startup', { enabled: true }, '启动位置已更新')}>更新启动位置</button></p>}
    <div className="setting-row"><div><strong>版本 {data?.version || '0.9.1'}</strong><p>{official ? '已绑定官方发布仓库' : '使用自定义发布仓库'} · 稳定版</p></div><button className="secondary-button" disabled={disabled || phase === 'ready'} onClick={() => void run('check_update', {})}>{phase === 'checking' ? '正在检查…' : '检查更新'}</button></div>
    <div className="setting-row"><div><strong>自动检查更新</strong><p>运行时每 6 小时检查一次。下载和安装由你决定，不会打断当前任务。</p></div><button role="switch" aria-label="自动检查更新" aria-checked={data?.updates.automatic || false} className={`toggle ${data?.updates.automatic ? 'on' : ''}`} disabled={disabled} onClick={() => void run('set_automatic_updates', { enabled: !data?.updates.automatic })}><span /></button></div>
    <p className="agent-note">{data?.updates.checkedAt ? `上次检查：${new Date(data.updates.checkedAt).toLocaleString('zh-CN')}` : '尚未检查发布版本'}</p>
    {data?.updates.error && <p role="alert" className="agent-warning">{data.updates.error}。{data.updates.latest ? '下方保留上次成功的版本信息。' : ''}</p>}
    {data?.updates.latest && <div className="release-result">
      <strong>{data.updates.latest.newer ? `发现新版本 ${data.updates.latest.version}` : '当前已是最新稳定版本'}</strong>
      <p>{data.updates.latest.title}</p>
      <details><summary>发布说明</summary><pre>{data.updates.latest.notes || '发布者未填写说明。'}</pre></details>
      {phase === 'downloading' && <div className="update-progress" role="status"><progress aria-label="更新下载进度" value={total ? downloaded : undefined} max={total || 1} /><span>正在下载 {megabytes(downloaded)}{total ? ` / ${megabytes(total)}` : ''}</span></div>}
      {phase === 'verifying' && <p role="status">下载完成，正在验证签名…</p>}
      {phase === 'installing' && <p role="status">正在启动安装程序…</p>}
      {data.transfer.message && <p role="status" className="agent-note">{data.transfer.message}</p>}
      <div className="update-actions">
        {phase === 'available' && <button className="primary-button" disabled={disabled} onClick={() => void run('download_update', {})}>下载更新</button>}
        {phase === 'ready' && <button className="primary-button" disabled={disabled} onClick={() => void run('install_update', {})}>安装并重启</button>}
        <button className="secondary-button" onClick={() => void invoke('open_release_page').catch(e => setError(String(e)))}>打开发布页</button>
      </div>
      {phase === 'available' && <p className="agent-note">更新包通过签名验证后才能安装。免安装版会转为当前用户安装版，保留角色和设置。</p>}
    </div>}
    <details className="update-source"><summary>更新来源 · {official ? '官方仓库' : '自定义仓库'}</summary>
      <p className="agent-note">无需登录 GitHub 或填写访问令牌。自定义仓库只用于检查版本；应用内更新仅接受官方签名包。</p>
      <label>发布仓库<input aria-label="更新发布仓库" value={repo} disabled={disabled} placeholder="https://github.com/所有者/仓库名" onChange={e => setRepo(e.target.value)} /></label>
      <div className="update-actions"><button className="secondary-button" disabled={disabled || repo === data?.updates.repository} onClick={() => void run('set_update_source', { repository: repo }, '更新来源已保存')}>保存更新来源</button>
        {!official && <button className="text-button" disabled={disabled} onClick={() => void run('set_update_source', { repository: data?.officialRepository }, '已恢复官方仓库')}>恢复官方仓库</button>}</div>
    </details>
    {error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status" className="agent-success">{message}</p>}
  </section>;
}
