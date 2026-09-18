import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Bell, ArrowUpRight, Cat, Check, ChevronRight, Coffee, Heart, Leaf, Moon, Play, Pause, Pencil, RotateCcw, Settings2, Shirt, Sparkles, Timer, Trash2, Upload, Volume2, X, Eye, EyeOff } from 'lucide-react';
import { PetRenderer } from './renderers/PetRenderer';
import { builtins, importFiles } from './core/packs';
import { useCompanion, useSnapshot, useSubscription } from './core/hooks';
import { formatTime, remaining } from './core/animation';
import { addPet, desktop, desktopAction, removePet, renamePet, timerAction, triggerAction, updatePreferences } from './platform/bridge';
import { petDefaultName, petDisplayName } from './core/petNames';
import { PetNameDialog } from './PetNameDialog';
import { AgentDashboard } from './AgentDashboard';
import { useAgentBubble } from './core/agentNotices';
import { useAmbient } from './core/useAmbient';
import { ambientTravel } from './core/ambient';
import { AmbientPanel } from './AmbientPanel';
import { Inbox } from './Inbox';
import { BackupPanel } from './BackupPanel';
import { SystemPanel } from './SystemPanel';
import { getIntegrations, integrationCommand, type IntegrationSettings } from './core/integrations';
import type { Action, PetPack, Preferences } from './core/types';

type Page='home'|'wardrobe'|'settings'|'agents'|'inbox';
export function App() {
  const {snapshot,error,setError}=useSnapshot(); const companion=useCompanion(snapshot.preferences,!desktop);
  const [page,setPage]=useState<Page>('home'); const [now,setNow]=useState(Date.now());
  useSubscription<string>('navigate-page',value=>{if(value==='agents'||value==='inbox')setPage(value);});
  const [minutes,setMinutes]=useState(25); const [pressed,setPressed]=useState(false); const [flipped,setFlipped]=useState(false);
  const [notice,setNotice]=useState(''); const [importing,setImporting]=useState(false);
  const [renaming,setRenaming]=useState<PetPack|null>(null);
  const fileInput=useRef<HTMLInputElement>(null); const noticeTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const previousTimer=useRef(snapshot.timer.status);
  const prefs=snapshot.preferences; const pets=[...builtins,...snapshot.customPets];
  const agentBubble=useAgentBubble(prefs,companion.action!=='idle'||pressed,!desktop);
  const ambientBlocked=companion.action!=='idle'||pressed||!!companion.bubble||agentBubble.motion!=='idle'||!!agentBubble.demo||!!agentBubble.text;
  const ambient=useAmbient(prefs,ambientBlocked,!desktop&&page==='home');
  const pack=pets.find(p=>p.id===prefs.petId)||builtins[0]; const skin=pack.skins.find(s=>s.id===prefs.skinId)||pack.skins[0];
  const name=petDisplayName(pack,prefs);
  const left=remaining(snapshot.timer,now); const active=snapshot.timer.status==='running'; const paused=snapshot.timer.status==='paused';
  useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(tick);},[]);
  useEffect(()=>()=>clearTimeout(noticeTimer.current),[]);
  useEffect(()=>{if(snapshot.timer.status==='done'&&previousTimer.current!=='done'){companion.play('celebrate');message('专注完成，休息一下吧。');}previousTimer.current=snapshot.timer.status;},[snapshot.timer.status]);
  function message(text:string){setNotice(text);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),4000);}
  async function perform(work:()=>Promise<unknown>,success?:string){try{await work();setError('');if(success)message(success);}catch(e){setError(e instanceof Error?e.message:String(e));}}
  const setPrefs=(patch:Partial<Preferences>)=>perform(()=>updatePreferences(patch));
  const [layoutBusy,setLayoutBusy]=useState(false);
  async function setPetLayout(petLayout:IntegrationSettings['petLayout']){setLayoutBusy(true);await perform(async()=>{const current=await getIntegrations();await integrationCommand('update_integrations',{settings:{...current.settings,petLayout}});});setLayoutBusy(false);}
  const act=(action:Action)=>perform(()=>triggerAction(action));
  function select(pet:PetPack){void perform(()=>updatePreferences({petId:pet.id,skinId:pet.skins[0].id}),`已经换成${petDisplayName(pet,prefs)}`);}
  async function handleImport(files:File[]){setImporting(true);await perform(async()=>{const imported=await importFiles(files);await addPet(imported);setPage('wardrobe');},'新伙伴已经住进来了');setImporting(false);if(fileInput.current)fileInput.current.value='';}
  const unread=(agentBubble.data.inbox||[]).filter(i=>!i.read).length;
  const titles={home:['我的伙伴','给忙碌的日常，留一点柔软。'],wardrobe:['角色衣橱','挑一个今天想陪在身边的伙伴。'],settings:['偏好设置','让陪伴刚刚好。'],agents:['Agent 看板','工作有进展，伙伴会告诉你。'],inbox:['提醒收件箱','错过的消息，留在这里慢慢看。']};
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Cat size={25} strokeWidth={1.6}/></span><div><strong>桌边<span>。</span></strong><small>DESKTOP COMPANION</small></div></div>
      <div className="sidebar-label">我的小天地</div>
      <nav aria-label="主导航">
        <button className={page==='home'?'active':''} onClick={()=>setPage('home')}><Heart size={18}/>我的伙伴<span className="nav-dot"/></button>
        <button className={page==='wardrobe'?'active':''} onClick={()=>setPage('wardrobe')}><Shirt size={18}/>角色衣橱<span className="nav-count">{pets.length}</span></button>
        <button className={page==='settings'?'active':''} onClick={()=>setPage('settings')}><Settings2 size={18}/>偏好设置</button>
        <button className={page==='agents'?'active':''} onClick={()=>setPage('agents')}><Sparkles size={18}/>Agent 看板</button>
        <button aria-label="提醒收件箱" className={page==='inbox'?'active':''} onClick={()=>setPage('inbox')}><Bell size={18}/>提醒收件箱{unread>0&&<span className="nav-count">{unread}</span>}</button>
      </nav>
      <div className="sidebar-bottom"><div className="little-note"><Leaf size={21}/><p>不用时刻回应。<br/>陪着你，就很好。</p></div><span className="version"><i/>本地陪伴 · v0.8.0</span></div>
    </aside>
    <main className="main-content">
      <header className="page-header"><div><div className="eyebrow">A LITTLE COMPANY</div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div>
        <button className={`quiet-button ${prefs.quiet?'selected':''}`} onClick={()=>void setPrefs({quiet:!prefs.quiet})} aria-pressed={prefs.quiet}><Moon size={16}/>{prefs.quiet?'免打扰中':'安静陪伴'}</button>
      </header>
      {!desktop&&<div className="preview-note">浏览器体验模式 · 桌面悬浮、穿透与托盘请在桌面应用中体验。</div>}
      {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="关闭错误提示" onClick={()=>setError('')}><X size={16}/></button></div>}
      {page==='home'&&<>
        <section className="companion-stage" aria-label="角色互动预览">
          <div className="stage-heading"><span className="status-pill"><i/>{prefs.quiet?'静静陪着你':active?'陪你专注中':'今天也在你身边'}</span><span className="mode-label">{pack.renderer==='static'?'静态 · 弹性互动':`逐帧 · ${pack.actions.idle.fps} FPS`}</span></div>
          <div className="stage-orbit orbit-one"/><div className="stage-orbit orbit-two"/><div className="stage-spark spark-one">✧</div><div className="stage-spark spark-two">✧</div>
          <div className="stage-character" style={{'--ambient-travel':`${ambientTravel(prefs)}px`} as CSSProperties}>
            {(companion.bubble||agentBubble.text)&&(!prefs.quiet||companion.action==='celebrate')&&<div className="preview-bubble" role="status">{companion.bubble||agentBubble.text}</div>}
            <button className="pet-touch" aria-label="摸摸宠物" onPointerDown={()=>setPressed(true)} onPointerUp={()=>setPressed(false)} onPointerLeave={()=>setPressed(false)} onClick={()=>void act('pet')}>
              <PetRenderer pack={pack} skin={skin} displayName={name} action={companion.action!=='idle'?companion.action:agentBubble.motion!=='idle'?agentBubble.motion:ambient.motion} sequence={companion.sequence+agentBubble.sequence+ambient.sequence} size={262} pressed={pressed} flipped={flipped}/>
            </button>
          </div>
          <div className="stage-footer"><div className="stage-identity"><div className="pet-name-row"><strong title={name}>{name}</strong><button className="rename-button" onClick={()=>setRenaming(pack)} aria-label={`给${name}改名`}><Pencil size={13}/>改名</button></div><span>{pack.description}</span></div><button className="round-button" onClick={()=>setFlipped(v=>!v)} aria-label="翻转预览"><RotateCcw size={16}/></button></div>
        </section>
        <div className="interaction-bar"><span>陪它玩一会儿</span><div>
          <button onClick={()=>void act('pet')}><Heart size={17}/>摸摸头</button><button onClick={()=>void act('happy')}><Coffee size={17}/>小零食</button><button onClick={()=>void act('sleepy')}><Moon size={17}/>打个盹</button><button onClick={()=>void act('celebrate')}><Sparkles size={17}/>庆祝一下</button>
        </div></div>
        <div className="home-grid">
          <section className="panel focus-panel"><div className="section-heading"><span><Timer size={18}/>一起专注</span><small>{active?'进行中':paused?'已暂停':snapshot.timer.status==='done'?'已完成':'留一段时间给自己'}</small></div>
            <div className="timer-row"><div className="timer-value" aria-live="off">{active||paused||snapshot.timer.status==='done'?formatTime(left):formatTime(minutes*60000)}<small>MIN : SEC</small></div><div className="timer-decoration"><Leaf size={36} strokeWidth={1}/></div></div>
            {!active&&!paused&&<div className="duration-options">{[15,25,45].map(m=><button key={m} aria-pressed={minutes===m} className={minutes===m?'chosen':''} onClick={()=>setMinutes(m)}>{m} 分钟</button>)}<label><input aria-label="自定义分钟" type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/><span>分钟</span></label></div>}
            <div className="timer-actions"><button className="primary-button" onClick={()=>void perform(()=>timerAction(active?'pause':paused?'resume':'start',minutes))}>{active?<Pause size={16}/>:<Play size={16}/>} {active?'暂停一下':paused?'继续专注':'开始专注'}</button>{(active||paused||snapshot.timer.status==='done')&&<button className="secondary-button" onClick={()=>void perform(()=>timerAction('reset'))}><RotateCcw size={15}/>结束</button>}</div>
          </section>
          <section className="panel appearance-panel"><div className="section-heading"><span><Shirt size={18}/>今日装扮</span><button className="text-button" onClick={()=>setPage('wardrobe')}>衣橱<ChevronRight size={14}/></button></div>
            <p className="panel-hint">一点小变化，也会有好心情。</p><div className="skin-picker">{pack.skins.map(s=><button key={s.id} className={skin.id===s.id?'selected':''} onClick={()=>void setPrefs({skinId:s.id})} aria-pressed={skin.id===s.id}><i style={{background:s.color}}>{skin.id===s.id&&<Check size={14}/>}</i>{s.name}</button>)}</div>
            <div className="desktop-visibility"><span><i className={prefs.petVisible?'online':''}/>{prefs.petVisible?'桌面上的伙伴已显示':'伙伴正在休息'}</span><button aria-label={prefs.petVisible?'隐藏桌面宠物':'显示桌面宠物'} onClick={()=>void setPrefs({petVisible:!prefs.petVisible})}>{prefs.petVisible?<Eye size={17}/>:<EyeOff size={17}/>}</button></div>
          </section>
        </div>
      </>}
      {page==='wardrobe'&&<>
        <div className="wardrobe-toolbar"><span>{pets.length} 位伙伴 · 两种陪伴方式</span><button className="primary-button" disabled={importing} onClick={()=>fileInput.current?.click()}><Upload size={16}/>{importing?'正在整理…':'导入角色'}</button></div>
        <div className="pet-grid">{pets.map(p=>{const current=p.id===pack.id;const s=p.skins[0];const displayName=petDisplayName(p,prefs);return <article className={`pet-card ${current?'selected':''}`} key={p.id}><div className="pet-card-image"><span className="pet-type">{p.renderer==='static'?'静态图片':'逐帧动画'}</span><PetRenderer pack={p} skin={s} displayName={displayName} size={190}/></div><div className="pet-card-body"><div className="pet-name-row"><h2 title={displayName}>{displayName}</h2><button className="rename-button" onClick={()=>setRenaming(p)} aria-label={`给${displayName}改名`}><Pencil size={13}/>改名</button></div><p>{p.description}</p><div className="pet-card-meta"><small>{p.skins.length} 套装扮 · {p.author}</small></div><div className="card-actions"><button className={current?'current-pet':'secondary-button'} disabled={current} onClick={()=>select(p)}>{current?<><Check size={16}/>正在陪伴</>:<>让它来陪我<ArrowUpRight size={15}/></>}</button>{p.id.startsWith('custom-')&&<button className="round-button" aria-label={`移除${displayName}`} onClick={()=>void perform(()=>removePet(p.id),'已移除导入的角色')}><Trash2 size={16}/></button>}</div></div></article>;})}</div>
        <div className="import-guide"><Upload size={20}/><div><strong>带上你自己的伙伴</strong><p>选一张透明 PNG，或同时选择角色 JSON 清单和全部 PNG 图片。支持逐帧序列与精灵图，单次最多 12 MB。</p><small>制作方式见发布包 CHARACTER-GUIDE.md；导入时只选择角色清单与 PNG 图片。</small></div></div>
      </>}
      {page==='agents'&&<AgentDashboard agent={agentBubble} pack={pack} skin={skin} name={name} preferences={prefs}/>}
      {page==='inbox'&&<Inbox data={agentBubble.data} onDashboard={()=>setPage('agents')}/>}
      {page==='settings'&&<div className="settings-stack">
        <AmbientPanel p={prefs} setPrefs={setPrefs} ambient={ambient} blocked={ambientBlocked} pack={pack} skin={skin} name={name}/>
        <section className="panel settings-panel"><h2>桌面上的样子</h2><Setting title="宠物大小" note="调整桌面角色大小，预览窗口保持固定尺寸"><div className="range-control"><input aria-label="宠物大小" type="range" min="0.65" max="1.35" step="0.05" value={prefs.scale} onChange={e=>void setPrefs({scale:Number(e.target.value)})}/><span>{Math.round(prefs.scale*100)}%</span></div></Setting>
          <Setting title="始终置顶" note="让伙伴显示在普通窗口上方"><Toggle checked={prefs.topmost} onChange={v=>void setPrefs({topmost:v})} label="始终置顶"/></Setting>
          <Setting title="数据框样式" note={agentBubble.data.settings.showPetStatus?'切换后立即生效并记住选择；简洁样式显示任务及所选附加指标':'数据框当前已隐藏，可在 Agent 看板开启显示'}><select className="pet-layout-select" aria-label="数据框样式" disabled={!desktop||layoutBusy} value={agentBubble.data.settings.petLayout||'side'} onChange={e=>void setPetLayout(e.target.value as IntegrationSettings['petLayout'])}><option value="side">侧边卡片 · 完整数据</option><option value="bottom">底部双行底座 · 完整数据</option><option value="compact">简洁状态条 · 最省空间</option></select></Setting>
          <Setting title="侧边数据框位置" note="自动模式在靠近屏幕边缘时换边，保持角色位置；只影响侧边卡片"><select className="pet-layout-select" aria-label="侧边数据框位置" value={prefs.panelSide} onChange={e=>void setPrefs({panelSide:e.target.value as typeof prefs.panelSide})}><option value="auto">自动换边</option><option value="left">固定左侧</option><option value="right">固定右侧</option></select></Setting>
          <Setting title="数据框大小" note="独立调整常显数据框，立即生效；空间不足时限制角色以避免越界"><div className="range-control"><input aria-label="数据框大小" type="range" min="0.8" max="1.25" step="0.05" value={prefs.panelScale} onChange={e=>void setPrefs({panelScale:Number(e.target.value)})}/><span>{Math.round(prefs.panelScale*100)}%</span><button className="text-button" onClick={()=>void setPrefs({panelScale:1})}>恢复 100%</button></div></Setting>
          <Setting title="全屏时自动避让" note="所在屏幕的前台应用全屏时临时隐藏，退出后恢复；保留手动隐藏状态和后台采集"><Toggle checked={prefs.avoidFullscreen} onChange={v=>void setPrefs({avoidFullscreen:v})} label="全屏时自动避让"/></Setting>
          <Setting title="气泡水平位置" note="默认跟随角色头顶；向左或向右微调"><div className="range-control"><input aria-label="气泡水平位置" type="range" min="-120" max="120" step="4" value={prefs.bubbleOffsetX} onChange={e=>void setPrefs({bubbleOffsetX:Number(e.target.value)})}/><span>{prefs.bubbleOffsetX}</span></div></Setting>
          <Setting title="气泡垂直位置" note="负数向上，正数向下；到达窗口边缘会自动限制"><div className="range-control"><input aria-label="气泡垂直位置" type="range" min="-120" max="120" step="4" value={prefs.bubbleOffsetY} onChange={e=>void setPrefs({bubbleOffsetY:Number(e.target.value)})}/><span>{prefs.bubbleOffsetY}</span></div></Setting>
          <Setting title="预览气泡位置" note="桌宠底部控制条在鼠标移入或键盘聚焦时显示"><div className="ambient-buttons"><button className="secondary-button" onClick={()=>void act('pet')}>显示气泡</button><button className="text-button" onClick={()=>void setPrefs({bubbleOffsetX:0,bubbleOffsetY:0})}>恢复默认位置</button></div></Setting>
          <Setting title="靠近边缘时吸附" note="拖到屏幕边缘，松开后轻轻停靠"><Toggle checked={prefs.snap} onChange={v=>void setPrefs({snap:v})} label="边缘吸附"/></Setting>
          <Setting title="找回桌面宠物" note="将伙伴移回主屏幕右下角"><button className="secondary-button" onClick={()=>void perform(()=>desktopAction('reset-position'),'伙伴已经回到主屏')}>移回主屏<ArrowUpRight size={14}/></button></Setting>
        </section>
        <section className="panel settings-panel"><h2>陪伴的节奏</h2><Setting title="互动音效" note="轻轻的提示音，免打扰时保持安静"><Toggle checked={prefs.sound} onChange={v=>void setPrefs({sound:v})} label="互动音效"/></Setting>
          <Setting title="音量" note="给日常留一点安静"><div className="range-control"><Volume2 size={16}/><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={e=>void setPrefs({volume:Number(e.target.value)})}/><span>{Math.round(prefs.volume*100)}%</span></div></Setting>
          <Setting title="免打扰" note="暂停互动气泡与音效，保留已设置的计时提醒"><Toggle checked={prefs.quiet} onChange={v=>void setPrefs({quiet:v})} label="免打扰"/></Setting>
        </section>
        <BackupPanel/>
        <SystemPanel/>
      </div>}
      <footer className="page-footer"><span>一点陪伴，一点日常。</span><span>DESKTOPPET / 01</span></footer>
    </main>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json" multiple aria-label="选择角色图片或角色包文件" onChange={e=>void handleImport(Array.from(e.target.files||[]))}/>
    {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
    {renaming&&<PetNameDialog key={renaming.id} name={petDisplayName(renaming,prefs)} defaultName={petDefaultName(renaming,prefs)} hasCustomName={!!prefs.petNames?.[renaming.id]} onClose={()=>setRenaming(null)} onSave={async (next,nextDefault)=>{await renamePet(renaming.id,next,nextDefault);message(next===null&&nextDefault===undefined?'已恢复默认名字':'名字保存好了');}}/>}
  </div>;
}
function Setting({title,note,children}:{title:string;note:string;children:ReactNode}) {return <div className="setting-row"><div><strong>{title}</strong><p>{note}</p></div>{children}</div>;}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}) {return <button className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}><span/></button>;}
