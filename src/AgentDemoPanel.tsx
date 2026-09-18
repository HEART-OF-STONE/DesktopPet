import { useState } from 'react';
import { Play, Square, Eye } from 'lucide-react';
import { demoAgent } from './core/integrations';
import type { AgentPresentation } from './core/agentNotices';
import type { PetPack, Preferences, Skin } from './core/types';
import { PetRenderer } from './renderers/PetRenderer';
import { updatePreferences, desktop } from './platform/bridge';

export interface AgentDemoProps {agent:AgentPresentation;pack:PetPack;skin:Skin;name:string;preferences:Preferences}
export function AgentDemoPanel({agent,pack,skin,name,preferences}:AgentDemoProps){
  const [error,setError]=useState('');
  async function play(kind:string){try{await demoAgent(kind);setError('');}catch(e){setError(String(e));}}
  return <section className="panel agent-demo-panel" aria-label="联动演示">
    <div className="agent-demo-copy"><h2><Play size={17}/>联动演示</h2><p>点选一种状态，同时预览管理面板和桌面伙伴的反应。10 秒后自动恢复，不写入任务或用量记录。</p>
      <div className="agent-demo-buttons">{[['running','工作中'],['waiting','待确认'],['completed','完成'],['failed','失败'],['balance','低余额']].map(([kind,label])=><button key={kind} aria-label={`演示${label}`} aria-pressed={agent.demo?.kind===kind} className={agent.demo?.kind===kind?'selected':''} onClick={()=>void play(kind)}>{label}</button>)}<button aria-label="停止演示" disabled={!agent.demo} onClick={()=>void play('stop')}><Square size={12}/>停止</button></div>
      {preferences.quiet&&<p className="agent-demo-hint">免打扰已开启：保留状态显示，动作、气泡和声音保持安静。</p>}
      {!preferences.petVisible&&desktop&&<button className="text-button" onClick={()=>void updatePreferences({petVisible:true}).catch(e=>setError(String(e)))}><Eye size={14}/>先显示桌面宠物</button>}
      {!desktop&&<p className="agent-demo-hint">浏览器只能预览，桌面窗口请使用可执行程序。</p>}
      {error&&<p role="alert" className="agent-warning">{error}</p>}
    </div>
    <div className={`agent-demo-preview status-${agent.status.kind}`}>
      {agent.text&&<span className="agent-demo-bubble">{agent.text}</span>}
      <PetRenderer pack={pack} skin={skin} displayName={name} action={agent.motion} sequence={agent.sequence} size={145}/>
      <small>{agent.demo?`演示 · ${agent.status.label} · ${Math.min(10,Math.max(0,Math.ceil((agent.demo.expiresAt-agent.clock)/1000)))} 秒`:agent.status.label}</small>
    </div>
  </section>;
}
