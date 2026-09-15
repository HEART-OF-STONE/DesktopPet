import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, Cat, Check, ChevronRight, Coffee, Heart, Leaf, Moon, Play, Pause, RotateCcw, Settings2, Shirt, Sparkles, Timer, Trash2, Upload, Volume2, X, Eye, EyeOff } from 'lucide-react';
import { PetRenderer } from './renderers/PetRenderer';
import { builtins, importFiles } from './core/packs';
import { useCompanion, useSnapshot } from './core/hooks';
import { formatTime, remaining } from './core/animation';
import { addPet, desktop, desktopAction, removePet, timerAction, triggerAction, updatePreferences } from './platform/bridge';
import type { Action, PetPack, Preferences } from './core/types';

type Page='home'|'wardrobe'|'settings';
export function App() {
  const {snapshot,error,setError}=useSnapshot(); const companion=useCompanion(snapshot.preferences,!desktop);
  const [page,setPage]=useState<Page>('home'); const [now,setNow]=useState(Date.now());
  const [minutes,setMinutes]=useState(25); const [pressed,setPressed]=useState(false); const [flipped,setFlipped]=useState(false);
  const [notice,setNotice]=useState(''); const [importing,setImporting]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null); const noticeTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const previousTimer=useRef(snapshot.timer.status);
  const prefs=snapshot.preferences; const pets=[...builtins,...snapshot.customPets];
  const pack=pets.find(p=>p.id===prefs.petId)||builtins[0]; const skin=pack.skins.find(s=>s.id===prefs.skinId)||pack.skins[0];
  const left=remaining(snapshot.timer,now); const active=snapshot.timer.status==='running'; const paused=snapshot.timer.status==='paused';
  useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(tick);},[]);
  useEffect(()=>()=>clearTimeout(noticeTimer.current),[]);
  useEffect(()=>{if(snapshot.timer.status==='done'&&previousTimer.current!=='done'){companion.play('celebrate');message('专注完成，休息一下吧。');}previousTimer.current=snapshot.timer.status;},[snapshot.timer.status]);
  function message(text:string){setNotice(text);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),4000);}
  async function perform(work:()=>Promise<unknown>,success?:string){try{await work();setError('');if(success)message(success);}catch(e){setError(e instanceof Error?e.message:String(e));}}
  const setPrefs=(patch:Partial<Preferences>)=>perform(()=>updatePreferences(patch));
  const act=(action:Action)=>perform(()=>triggerAction(action));
  function select(pet:PetPack){void perform(()=>updatePreferences({petId:pet.id,skinId:pet.skins[0].id}),`已经换成${pet.name}`);}
  async function handleImport(files:File[]){setImporting(true);await perform(async()=>{const imported=await importFiles(files);await addPet(imported);setPage('wardrobe');},'新伙伴已经住进来了');setImporting(false);if(fileInput.current)fileInput.current.value='';}
  function exportPreferences(){const json=JSON.stringify({version:1,preferences:prefs},null,2);const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='desktop-pet-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已导出外观与行为设置');}
  const titles={home:['我的伙伴','给忙碌的日常，留一点柔软。'],wardrobe:['角色衣橱','挑一个今天想陪在身边的伙伴。'],settings:['偏好设置','让陪伴刚刚好。']};
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Cat size={25} strokeWidth={1.6}/></span><div><strong>桌边<span>。</span></strong><small>DESKTOP COMPANION</small></div></div>
      <div className="sidebar-label">我的小天地</div>
      <nav aria-label="主导航">
        <button className={page==='home'?'active':''} onClick={()=>setPage('home')}><Heart size={18}/>我的伙伴<span className="nav-dot"/></button>
        <button className={page==='wardrobe'?'active':''} onClick={()=>setPage('wardrobe')}><Shirt size={18}/>角色衣橱<span className="nav-count">{pets.length}</span></button>
        <button className={page==='settings'?'active':''} onClick={()=>setPage('settings')}><Settings2 size={18}/>偏好设置</button>
      </nav>
      <div className="sidebar-bottom"><div className="little-note"><Leaf size={21}/><p>不用时刻回应。<br/>陪着你，就很好。</p></div><span className="version"><i/>本地陪伴 · v0.1.0</span></div>
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
          <div className="stage-character">
            {companion.bubble&&(!prefs.quiet||companion.action==='celebrate')&&<div className="preview-bubble" role="status">{companion.bubble}</div>}
            <button className="pet-touch" aria-label="摸摸宠物" onPointerDown={()=>setPressed(true)} onPointerUp={()=>setPressed(false)} onPointerLeave={()=>setPressed(false)} onClick={()=>void act('pet')}>
              <PetRenderer pack={pack} skin={skin} action={companion.action} sequence={companion.sequence} size={262} pressed={pressed} flipped={flipped}/>
            </button>
          </div>
          <div className="stage-footer"><div><strong>{pack.name}</strong><span>{pack.description}</span></div><button className="round-button" onClick={()=>setFlipped(v=>!v)} aria-label="翻转预览"><RotateCcw size={16}/></button></div>
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
        <div className="pet-grid">{pets.map(p=>{const current=p.id===pack.id;const s=p.skins[0];return <article className={`pet-card ${current?'selected':''}`} key={p.id}><div className="pet-card-image"><span className="pet-type">{p.renderer==='static'?'静态图片':'逐帧动画'}</span><PetRenderer pack={p} skin={s} size={190}/></div><div className="pet-card-body"><h2>{p.name}</h2><p>{p.description}</p><div className="pet-card-meta"><small>{p.skins.length} 套装扮 · {p.author}</small></div><div className="card-actions"><button className={current?'current-pet':'secondary-button'} disabled={current} onClick={()=>select(p)}>{current?<><Check size={16}/>正在陪伴</>:<>让它来陪我<ArrowUpRight size={15}/></>}</button>{p.id.startsWith('custom-')&&<button className="round-button" aria-label={`移除${p.name}`} onClick={()=>void perform(()=>removePet(p.id),'已移除导入的角色')}><Trash2 size={16}/></button>}</div></div></article>;})}</div>
        <div className="import-guide"><Upload size={20}/><div><strong>带上你自己的伙伴</strong><p>选一张透明 PNG，或同时选择角色 JSON 清单和全部 PNG 图片。支持逐帧序列与精灵图，单次最多 12 MB。</p><small>角色包格式见项目内 docs/04-character-packs.md；原始图片会保留。</small></div></div>
      </>}
      {page==='settings'&&<div className="settings-stack">
        <section className="panel settings-panel"><h2>桌面上的样子</h2><Setting title="宠物大小" note="调整桌面角色大小，预览窗口保持固定尺寸"><div className="range-control"><input aria-label="宠物大小" type="range" min="0.65" max="1.35" step="0.05" value={prefs.scale} onChange={e=>void setPrefs({scale:Number(e.target.value)})}/><span>{Math.round(prefs.scale*100)}%</span></div></Setting>
          <Setting title="始终置顶" note="让伙伴显示在普通窗口上方"><Toggle checked={prefs.topmost} onChange={v=>void setPrefs({topmost:v})} label="始终置顶"/></Setting>
          <Setting title="靠近边缘时吸附" note="拖到屏幕边缘，松开后轻轻停靠"><Toggle checked={prefs.snap} onChange={v=>void setPrefs({snap:v})} label="边缘吸附"/></Setting>
          <Setting title="找回桌面宠物" note="将伙伴移回主屏幕右下角"><button className="secondary-button" onClick={()=>void perform(()=>desktopAction('reset-position'),'伙伴已经回到主屏')}>移回主屏<ArrowUpRight size={14}/></button></Setting>
        </section>
        <section className="panel settings-panel"><h2>陪伴的节奏</h2><Setting title="互动音效" note="轻轻的提示音，免打扰时保持安静"><Toggle checked={prefs.sound} onChange={v=>void setPrefs({sound:v})} label="互动音效"/></Setting>
          <Setting title="音量" note="给日常留一点安静"><div className="range-control"><Volume2 size={16}/><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={e=>void setPrefs({volume:Number(e.target.value)})}/><span>{Math.round(prefs.volume*100)}%</span></div></Setting>
          <Setting title="免打扰" note="暂停互动气泡与音效，保留已设置的计时提醒"><Toggle checked={prefs.quiet} onChange={v=>void setPrefs({quiet:v})} label="免打扰"/></Setting>
        </section>
        <section className="panel settings-panel"><h2>本地数据</h2><Setting title="导出外观与行为设置" note="保存一份 JSON 配置，不包含角色图片"><button className="secondary-button" onClick={exportPreferences}><ArrowDownToLine size={15}/>导出</button></Setting><div className="local-note"><Leaf size={17}/>角色、偏好和计时都留在本机。</div></section>
      </div>}
      <footer className="page-footer"><span>一点陪伴，一点日常。</span><span>DESKTOPPET / 01</span></footer>
    </main>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".png,.json" multiple aria-label="选择角色图片或角色包文件" onChange={e=>void handleImport(Array.from(e.target.files||[]))}/>
    {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
  </div>;
}
function Setting({title,note,children}:{title:string;note:string;children:ReactNode}) {return <div className="setting-row"><div><strong>{title}</strong><p>{note}</p></div>{children}</div>;}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:(value:boolean)=>void;label:string}) {return <button className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)}><span/></button>;}
