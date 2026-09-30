import { useEffect, useRef, useState } from 'react';
import { defaultSnapshot, type Action, type Snapshot, type Preferences, type PetPack, type PetMotion } from './types';
import { motionDuration } from './motions';
import { softChime } from './audio';
import { getSnapshot, subscribe } from '../platform/bridge';

export function useSubscription<T>(topic: string, callback: (value: T) => void) {
  const ref = useRef(callback); ref.current = callback;
  useEffect(() => {
    let disposed = false; let off: (() => void) | undefined;
    subscribe<T>(topic, value => ref.current(value)).then(unlisten => { if (disposed) unlisten(); else off = unlisten; }).catch(console.error);
    return () => { disposed = true; off?.(); };
  }, [topic]);
}
export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot>(defaultSnapshot);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; getSnapshot().then(s => live && setSnapshot(s)).catch(e => live && setError(String(e))); return () => { live = false; }; }, []);
  useSubscription<Snapshot>('state-changed', setSnapshot);
  return { snapshot, error, setError };
}
const lines: Record<Action, string[]> = {
  idle: ['我在这里，慢慢来就好。', '今天也想陪在你身边。'],
  pet: ['嘿嘿，再摸一下嘛。', '今天的快乐，收到了！', '呼噜呼噜……'],
  happy: ['好吃！给你留了一小口。', '补充能量，我们一起加油。'],
  sleepy: ['我眯一会儿，你忙你的。', '小小地打个盹……'],
  drag: ['出发！去桌面的另一边。', '这里就是我的新位置吗？'],
  celebrate: ['完成啦！起来伸个懒腰吧。', '专注的你，很棒哦。'],
};
export function useCompanion(preferences?: Preferences, soundEnabled=true, pack?: PetPack) {
  const [action, setAction] = useState<Action>('idle');
  const [bubble, setBubble] = useState('');
  const [sequence, setSequence] = useState(0);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actionTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previous = useRef('');
  const playing = useRef({ action: 'idle' as Action, sequence: 0 });
  function complete(done: PetMotion, token: number) {
    if (playing.current.action !== done || playing.current.sequence !== token) return;
    clearTimeout(actionTimeout.current); playing.current.action = 'idle'; setAction('idle');
  }
  function play(next: Action) {
    if (soundEnabled && preferences?.sound && !preferences.quiet && next!=='idle') softChime(preferences.volume);
    clearTimeout(timeout.current);
    clearTimeout(actionTimeout.current);
    const token = playing.current.sequence + 1;
    playing.current = { action: next, sequence: token }; setAction(next); setSequence(token);
    const choices = lines[next].filter(line => line !== previous.current);
    const line = choices[Math.floor(Math.random() * choices.length)] || lines[next][0];
    previous.current = line; setBubble(line);
    // Renderer completion controls the pose; a watchdog also handles missing/unmounted renderers.
    const duration = pack ? motionDuration(pack, next, token) : next === 'sleepy' ? 7000 : next === 'drag' ? 600 : 4200;
    if (Number.isFinite(duration)) actionTimeout.current = setTimeout(() => complete(next, token), duration + 1500);
    timeout.current = setTimeout(() => setBubble(''), next === 'sleepy' ? 7000 : 4200);
  }
  useSubscription<Action>('pet-action', play);
  useEffect(() => () => {clearTimeout(timeout.current);clearTimeout(actionTimeout.current);}, []);
  useEffect(() => { clearTimeout(actionTimeout.current); clearTimeout(timeout.current); playing.current.action = 'idle'; setAction('idle'); setBubble(''); }, [pack?.id, preferences?.quiet, preferences?.petVisible]);
  return { action, bubble, sequence, play, complete, dismiss: () => setBubble('') };
}
