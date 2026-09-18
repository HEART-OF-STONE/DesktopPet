import { expect,it } from 'vitest';
import { emptyIntegrations } from './integrations';
import { connectionHealth,senderCommand } from './connections';
it('does not confuse a local probe, manual test and external events',()=>{
  const d={...emptyIntegrations,settings:{...emptyIntegrations.settings,bridgeEnabled:true},connection:{testedAt:100,lastEventAt:null,lastSource:null}};
  expect(connectionHealth(d,200).bridge.label).toContain('等待 Agent');
  expect(connectionHealth({...d,connection:{testedAt:100,lastEventAt:150,lastSource:'manual-test'}},200).bridge.label).toBe('已收到手动测试');
  expect(connectionHealth({...d,connection:{testedAt:100,lastEventAt:150,lastSource:'codex'}},200).bridge.label).toBe('已收到外部事件');
});
it('reports missing, empty and stale log data honestly',()=>{
  expect(connectionHealth({...emptyIntegrations,scanError:'目录不可读'},100).codex.label).toBe('日志暂不可读');
  expect(connectionHealth({...emptyIntegrations,scanAt:100,scannedFiles:0},200).codex.label).toContain('暂无日志');
  expect(connectionHealth({...emptyIntegrations,scanAt:100,scannedFiles:1},40000).codex.label).toBe('采集待更新');
});
it('quotes PowerShell paths without expanding dollar signs or embedded apostrophes',()=>{
  expect(senderCommand("C:\\someone's $data\\send-agent-event.ps1")).toContain("& 'C:\\someone''s $data\\send-agent-event.ps1'");
});
