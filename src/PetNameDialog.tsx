import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizePetName } from './core/petNames';

interface Props {
  name: string;
  defaultName: string;
  hasCustomName: boolean;
  onSave: (name: string | null, defaultName?: string) => Promise<void>;
  onClose: () => void;
}

export function PetNameDialog({ name, defaultName, hasCustomName, onSave, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [draft, setDraft] = useState(name);
  const [defaultDraft, setDefaultDraft] = useState(defaultName);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current?.showModal(); input.current?.select(); }, []);
  async function save(reset = false) {
    setError('');
    try {
      const nextDefault = defaultDraft !== defaultName ? normalizePetName(defaultDraft) : undefined;
      // A pet with no nickname follows its default when only that default is edited.
      const next = reset || (!hasCustomName && draft === name) ? null : normalizePetName(draft);
      setSaving(true);
      await onSave(next === (nextDefault ?? defaultName) ? null : next, nextDefault);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSaving(false); }
  }
  return <dialog ref={dialog} className="rename-dialog" aria-labelledby={`${id}-title`} onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="rename-heading"><h2 id={`${id}-title`}>给伙伴起个名字</h2><button type="button" aria-label="关闭改名" disabled={saving} onClick={onClose}><X size={18}/></button></div>
      <label htmlFor={`${id}-input`}>伙伴名字</label>
      <input ref={input} id={`${id}-input`} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }} autoFocus autoComplete="off" maxLength={100} disabled={saving} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-hint`}/>
      <p id={`${id}-hint`} className="rename-hint">1–24 个字符。每位伙伴分别保存，换装不会改变名字。</p>
      <details className="default-name-options">
        <summary>修改默认名字 <span title={defaultName}>{defaultName}</span></summary>
        <label htmlFor={`${id}-default`}>默认名字</label>
        <input id={`${id}-default`} value={defaultDraft} onChange={e => { setDefaultDraft(e.target.value); setError(''); }} autoComplete="off" maxLength={100} disabled={saving}/>
        <p className="rename-hint">恢复默认名时使用这个名字；已有昵称会保留。</p>
      </details>
      {error && <p id={`${id}-error`} className="rename-error" role="alert">{error}</p>}
      <div className="rename-actions">
        {hasCustomName && <button className="text-button" type="button" disabled={saving} onClick={() => void save(true)}>恢复默认名</button>}
        <button className="secondary-button" type="button" disabled={saving} onClick={onClose}>取消</button>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存名字'}</button>
      </div>
    </form>
  </dialog>;
}
