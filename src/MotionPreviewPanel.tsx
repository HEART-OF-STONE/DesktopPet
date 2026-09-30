import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Play, Square } from 'lucide-react';
import { PetRenderer } from './renderers/PetRenderer';
import { ACTIONS, MOTIONS, type PetMotion, type PetPack, type Preferences } from './core/types';
import { motionLabels, resolveMotion } from './core/motions';
import { petDisplayName } from './core/petNames';
import './motionPreview.css';

export function MotionPreviewPanel({ pack, packs, preferences, onApply }: {
  pack: PetPack; packs: PetPack[]; preferences: Preferences; onApply: (pack: PetPack) => void;
}) {
  const [selected, setSelected] = useState(pack.id);
  const [play, setPlay] = useState({ action: 'idle' as PetMotion, sequence: 0 });
  const current = useRef(play); current.current = play;
  const [last, setLast] = useState('');
  const counts = useRef<Partial<Record<PetMotion, number>>>({});
  const preview = packs.find(p => p.id === selected) || pack;
  const skin = preview.skins.find(s => s.id === preferences.skinId) || preview.skins[0];
  const name = petDisplayName(preview, preferences);
  useEffect(() => { setSelected(pack.id); }, [pack.id]);
  function stop() { current.current = { action: 'idle', sequence: 0 }; setPlay(current.current); setLast(''); }
  useEffect(() => { stop(); counts.current = {}; }, [preview.id]);
  function start(action: PetMotion) {
    const sequence = (counts.current[action] || 0) + 1; counts.current[action] = sequence;
    current.current = { action, sequence }; setPlay(current.current); setLast('');
  }
  function complete(action: PetMotion, sequence: number) {
    if (current.current.action !== action || current.current.sequence !== sequence) return;
    current.current = { action: 'idle', sequence: 0 }; setPlay(current.current);
    setLast(`${motionLabels[action]}已完成，回到安静陪伴。`);
  }
  const resolved = resolveMotion(preview, play.action, play.sequence);
  const available = MOTIONS.filter(m => ACTIONS.some(a => a === m) || preview.actions[m]);
  return <section className="panel motion-preview-panel" aria-label="动作试映">
    <div className="section-heading"><span><Play size={17}/>动作试映</span><small>重复点同一动作，试试不同回应</small></div>
    <div className="motion-preview-layout">
      <div className="motion-preview-stage" style={{ '--ambient-travel': '12px' } as CSSProperties}>
        <PetRenderer pack={preview} skin={skin} displayName={name} action={play.action} sequence={play.sequence} size={220} onComplete={complete}/>
        <p role="status">{last || (play.action === 'idle' ? preview.renderer === 'static' ? '安静陪着你，试试下面的互动。' : '安静陪伴，不时做个小动作。' : `${motionLabels[play.action]}${resolved.count > 1 ? ` · 第 ${resolved.variant + 1}/${resolved.count} 种回应` : ''}`)}</p>
      </div>
      <div className="motion-preview-options">
        <label>预览角色<select aria-label="预览角色" value={preview.id} onChange={e => setSelected(e.target.value)}>{packs.map(p => <option key={p.id} value={p.id}>{petDisplayName(p, preferences)}</option>)}</select></label>
        <div className="motion-preview-buttons">{available.map(m => <button key={m} className={`secondary-button ${play.action === m ? 'selected' : ''}`} aria-label={`预览：${motionLabels[m]}`} aria-pressed={play.action === m} onClick={() => start(m)}>{motionLabels[m]}{(preview.actions[m]?.variants?.length || 0) > 0 && <small>{1 + preview.actions[m]!.variants!.length}</small>}</button>)}</div>
        <div className="motion-preview-footer"><button className="text-button" onClick={stop}><Square size={12}/>回到待机</button>{preview.id !== preferences.petId && <button className="primary-button" onClick={() => onApply(preview)}>让它来陪我</button>}</div>
        <p className="agent-note">{preview.renderer === 'static' ? '这个角色使用静态图片和弹性反馈。选择动画版，可以试试更多姿势。' : '动作结束后自然恢复待机。这里的预览独立播放，可放心试一遍。'}</p>
      </div>
    </div>
  </section>;
}
