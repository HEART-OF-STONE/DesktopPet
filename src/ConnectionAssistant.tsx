import { useState } from 'react';
import { CheckCircle2, PlugZap, Copy } from 'lucide-react';
import { connectionHealth, senderCommand } from './core/connections';
import { timeLabel, type IntegrationSnapshot } from './core/integrations';
import { desktop } from './platform/bridge';

interface Props {data:IntegrationSnapshot;disabled:boolean;pending:boolean;run:(command:string,args:Record<string,unknown>,success:string)=>Promise<void>}
export function ConnectionAssistant({data,disabled,pending,run}:Props){
  const [copyMessage,setCopyMessage]=useState('');const health=connectionHealth(data,Date.now());
  const command=data.senderScript?senderCommand(data.senderScript):'';
  async function copy(){try{await navigator.clipboard.writeText(command);setCopyMessage('已复制，在 PowerShell 中粘贴运行。');}catch{setCopyMessage('无法自动复制，请选中下方命令后复制。');}}
  return <section className="panel connection-assistant" aria-label="联动接入助手">
    <h2><PlugZap size={18}/>联动接入助手</h2><p className="agent-note">从本机检测到实际事件，一步步确认伙伴能收到消息。不会启动模型任务。</p>
    <div className="connection-health-grid">
      <article className={`connection-health ${health.codex.tone}`}><h3>1 · Codex 日志</h3><strong>{desktop?health.codex.label:'请在桌面版检测'}</strong><p>{health.codex.hint}</p><small>最近读取：{timeLabel(data.scanAt)}</small>
        <button className="secondary-button" disabled={disabled||pending||!desktop} onClick={()=>void run(data.settings.codexEnabled?'check_connections':'update_integrations',data.settings.codexEnabled?{}:{settings:{...data.settings,codexEnabled:true}},data.settings.codexEnabled?'本机日志检查完成，请查看检测结果。':'日志采集已开启，后台将自动读取。')}>{data.settings.codexEnabled?'重新检查日志':'开启日志采集'}</button>
      </article>
      <article className={`connection-health ${health.bridge.tone}`}><h3>2 · 本机事件通道</h3><strong>{desktop?health.bridge.label:'请在桌面版连接'}</strong><p>{health.bridge.hint}</p><small>本次启动自检：{timeLabel(data.connection?.testedAt||null)}</small>
        <button className="secondary-button" disabled={disabled||pending||!desktop} onClick={()=>void run(data.settings.bridgeEnabled?'test_agent_connection':'update_integrations',data.settings.bridgeEnabled?{}:{settings:{...data.settings,bridgeEnabled:true}},data.settings.bridgeEnabled?'本机通道测试通过，已发送一次演示；真实任务和用量未改变。':'事件接口已开启，请继续测试本机通道。')}><CheckCircle2 size={14}/>{data.settings.bridgeEnabled?'测试本机通道':'开启事件接口'}</button>
      </article>
    </div>
    {pending&&<p className="agent-warning">下方有未保存的连接设置，请先保存或撤销再使用接入助手。</p>}
    <details className="connection-steps"><summary>3 · 让 Agent 发送事件</summary>
      <ol><li>开启事件接口并完成本机通道测试。</li><li>将发布包完整解压，使用配套脚本把 Agent 的完成、失败或待确认事件发给桌边。</li><li>保持桌边运行，触发一次真实 Agent 事件；上方应显示“已收到外部事件”及最近来源。</li></ol>
      <p className="agent-note">Codex 普通任务可从日志读取；待确认通知使用 codex-hook.ps1 接入。完整步骤见发布包 AGENT-GUIDE.md。这里不会自动改动 Codex 配置。</p>
      {command?<><label className="connection-command">手动测试命令<textarea aria-label="手动测试命令" readOnly value={command} rows={3} onFocus={e=>e.target.select()}/></label><button className="secondary-button" onClick={()=>void copy()}><Copy size={14}/>复制测试命令</button><p role="status" className="agent-note">{copyMessage||'该命令创建一条 manual-test 任务，不提交 token。它只能验证手动发送，不能证明 Agent Hook 已安装。'}</p></>:<p className="agent-warning">未发现同目录接入脚本。请使用完整发布 ZIP，确保 send-agent-event.ps1 与程序在同一文件夹。</p>}
      {data.connection?.lastEventAt&&<p className="agent-note">本次启动最近事件：{data.connection.lastSource} · {timeLabel(data.connection.lastEventAt)}</p>}
    </details>
  </section>;
}
