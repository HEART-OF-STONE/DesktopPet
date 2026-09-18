import type { IntegrationSnapshot } from './integrations';
export function connectionHealth(d:IntegrationSnapshot,now:number){
  const codex=!d.settings.codexEnabled?{label:'日志采集已关闭',hint:'开启后可读取本机任务与用量。',tone:'muted'}:
    d.scanError?{label:'日志暂不可读',hint:d.scanError,tone:'warning'}:
    !d.scanAt?{label:'等待首次读取',hint:'点击重新检查；也可以先在 Codex 完成一次任务。',tone:'muted'}:
    now-d.scanAt>30000?{label:'采集待更新',hint:'保留上次结果，点击重新检查。',tone:'warning'}:
    !d.scannedFiles?{label:'目录可读，暂无日志',hint:'在 Codex 完成一次任务后再检查目录。',tone:'muted'}:
    {label:d.scanPending?'日志已连接 · 补读中':'日志已连接',hint:'可读取任务和用量。审批通知还需要事件接入。',tone:'ok'};
  const c=d.connection;
  const bridge=!d.settings.bridgeEnabled?{label:'事件接口未开启',hint:'开启本机事件接口，再测试通道。',tone:'muted'}:
    c?.lastEventAt?{label:c.lastSource==='manual-test'?'已收到手动测试':'已收到外部事件',hint:`本次启动最近来源：${c.lastSource}。这不代表 Agent 持续在线。`,tone:'ok'}:
    c?.testedAt?{label:'本机通道通过 · 等待 Agent',hint:'自检仅证明本机接口可用，尚未收到外部 Agent 事件。',tone:'ok'}:
    {label:'接口已开启 · 尚未验证',hint:'先测试本机通道，再让 Agent 发送事件。',tone:'muted'};
  return {codex,bridge};
}
export const powershellLiteral=(s:string)=>`'${s.replaceAll("'","''")}'`;
export function senderCommand(path:string){return `& ${powershellLiteral(path)} -Source 'manual-test' -SessionId 'setup' -TurnId 'connection-check' -Status completed`;}
