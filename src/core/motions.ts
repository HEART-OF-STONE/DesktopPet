import type { Clip, PetMotion, PetPack } from './types';

export const motionLabels: Record<PetMotion, string> = {
  idle: '安静陪伴', pet: '摸摸头', happy: '吃零食', sleepy: '睡一会儿', drag: '被提起来', celebrate: '庆祝',
  stretch: '伸懒腰', look: '四处看看', doze: '打瞌睡', stroll: '挪一挪',
  thinking: '认真工作', attention: '抬头提醒', error: '有点困惑', blink: '眨眨眼', ear: '动动耳朵', tail: '摆摆尾巴',
};
const fallback: Partial<Record<PetMotion, PetMotion>> = {
  thinking: 'idle', look: 'idle', stroll: 'idle', attention: 'pet', stretch: 'pet', error: 'sleepy', doze: 'sleepy',
};
/** The event sequence selects the same variant in both windows; no render-time randomness. */
export function resolveMotion(pack: PetPack, action: PetMotion, sequence = 0): { clip: Clip; native: boolean; variant: number; count: number } {
  const native = !!pack.actions[action];
  const definition = pack.actions[action] || pack.actions[fallback[action] || 'idle'] || pack.actions.idle;
  const count = 1 + (definition.variants?.length || 0);
  const variant = Math.max(0, Math.floor(sequence - 1)) % count;
  return { clip: variant ? definition.variants![variant - 1] : definition, native, variant, count };
}
export function clipDuration(clip: Clip) { return clip.frames.length / clip.fps * 1000; }
const loopLimits: Partial<Record<PetMotion, number>> = { sleepy: 7000, doze: 8000, drag: 600, stretch: 4200, look: 5000, stroll: 6000, pet: 4200, happy: 4200, celebrate: 4200, attention: 2800, error: 4200 };
export function motionDuration(pack: PetPack, action: PetMotion, sequence = 0): number {
  const { clip, native } = resolveMotion(pack, action, sequence);
  if (action === 'idle' || action === 'thinking') return Infinity;
  // Older packs still receive their procedural feedback even if their image is a single frame.
  if (!native || pack.renderer === 'static') return loopLimits[action] || 2800;
  return clip.loop ? clip.durationMs ?? loopLimits[action] ?? Infinity : clipDuration(clip);
}
export const microMotions = ['blink', 'ear', 'tail'] as const;
export function microDelay(action: typeof microMotions[number], random: number) {
  const ranges = { blink: [3000, 7000], ear: [11000, 23000], tail: [8000, 18000] };
  const [low, high] = ranges[action];
  return low + (high - low) * Math.max(0, Math.min(1, random));
}
