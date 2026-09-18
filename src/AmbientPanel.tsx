import { useState } from 'react';
import { Leaf, Square } from 'lucide-react';
import { ambientLabel, ambientTravel } from './core/ambient';
import { previewAmbient } from './platform/bridge';
import { PetRenderer } from './renderers/PetRenderer';
import type { AmbientMotion, PetPack, Preferences, Skin } from './core/types';
import type { useAmbient } from './core/useAmbient';
import type { CSSProperties } from 'react';

export function AmbientPanel({p,setPrefs,ambient,blocked,pack,skin,name}:{p:Preferences;setPrefs:(v:Partial<Preferences>)=>unknown;ambient:ReturnType<typeof useAmbient>;blocked:boolean;pack:PetPack;skin:Skin;name:string}){
  const [error,setError]=useState('');
  async function preview(kind:string){try{await previewAmbient(kind);setError('');}catch(e){setError(String(e));}}
  const paused=!p.ambientEnabled||p.quiet||!p.petVisible||blocked;
  return <section className="panel ambient-panel" aria-label="自主陪伴设置"><h2><Leaf size={18}/>自主陪伴</h2>
    <p className="agent-note">不时伸个懒腰、看看四周，安静地陪着你。行为在本机产生，不调用 AI，也不会主动发出声音。</p>
    <label className="agent-check"><input type="checkbox" checked={p.ambientEnabled} onChange={e=>setPrefs({ambientEnabled:e.target.checked})}/>开启自主陪伴</label>
    <div className="ambient-form"><label>活动频率<select aria-label="自主陪伴频率" disabled={!p.ambientEnabled} value={p.ambientFrequency} onChange={e=>setPrefs({ambientFrequency:e.target.value as Preferences['ambientFrequency']})}><option value="low">安静 · 约 90–180 秒一次</option><option value="normal">适中 · 约 45–90 秒一次</option><option value="lively">活泼 · 约 20–40 秒一次</option></select></label>
      <label>活动范围<select aria-label="自主陪伴范围" disabled={!p.ambientEnabled} value={p.ambientRange} onChange={e=>setPrefs({ambientRange:e.target.value as Preferences['ambientRange']})}><option value="still">原地陪伴（默认）</option><option value="small">小幅挪动 · 左右 8 像素</option><option value="medium">稍大范围 · 左右 18 像素</option></select></label></div>
    <p className="agent-note">挪动以当前位置为中心，限于桌宠窗口内；不会自行跨屏。拖动、互动、计时提醒和 Agent 状态优先，免打扰或隐藏时暂停。</p>
    <div className="ambient-preview-row"><div><strong>马上看看</strong><div className="ambient-buttons">{(Object.keys(ambientLabel) as AmbientMotion[]).map(kind=><button className="secondary-button" key={kind} disabled={paused||kind==='stroll'&&p.ambientRange==='still'} onClick={()=>void preview(kind)}>{ambientLabel[kind]}</button>)}<button className="text-button" onClick={()=>void preview('stop')}><Square size={12}/>停止</button></div><p className="agent-note" role="status">{paused?'当前暂停：请开启自主陪伴、显示桌宠并关闭免打扰；任务或互动结束后可预览。':ambient.motion==='idle'?'预览会同步到桌宠，几秒后恢复待机。':`正在${ambientLabel[ambient.motion]}…`}</p></div>
      <div className="ambient-preview" style={{'--ambient-travel':`${ambientTravel(p)}px`} as CSSProperties}><PetRenderer pack={pack} skin={skin} displayName={name} action={ambient.motion} sequence={ambient.sequence} size={120}/></div></div>
    {error&&<p role="alert" className="agent-warning">{error}</p>}
  </section>;
}
