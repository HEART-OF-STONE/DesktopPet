import { describe, expect, it } from 'vitest';
import { builtins, validatePack } from './packs';
import { microDelay, motionDuration, resolveMotion } from './motions';
import { ambientInitial, ambientStep } from './ambient';
import { defaultSnapshot, type Clip } from './types';

describe('motion playback contracts', () => {
  const pack = builtins[1];
  it('selects distinct variants deterministically across windows', () => {
    const seen = [1, 2, 3].map(s => resolveMotion(pack, 'pet', s).clip.frames[0].asset);
    expect(new Set(seen).size).toBe(3);
    expect(resolveMotion(pack, 'pet', 4).clip).toBe(resolveMotion(pack, 'pet', 1).clip);
    expect(resolveMotion(pack, 'pet', 2)).toEqual(resolveMotion(pack, 'pet', 2));
  });
  it('finishes one-shots by frame duration and bounds sleeping loops', () => {
    expect(motionDuration(pack, 'pet')).toBe(2000);
    expect(motionDuration(pack, 'sleepy')).toBe(7000);
    expect(motionDuration(pack, 'thinking')).toBe(Infinity);
    expect(motionDuration(builtins[0], 'pet')).toBe(4200);
    const legacy = { ...pack, actions: { idle: pack.actions.idle } };
    expect(resolveMotion(legacy, 'stretch').native).toBe(false);
    expect(motionDuration(legacy, 'stretch')).toBe(4200);
  });
  it('separates blink and slower ear/tail cooldowns', () => {
    expect(microDelay('blink', 0)).toBe(3000); expect(microDelay('blink', 1)).toBe(7000);
    expect(microDelay('ear', 0)).toBeGreaterThan(microDelay('blink', 1));
    expect(microDelay('tail', -1)).toBe(8000);
  });
});
describe('v2 import boundaries', () => {
  const clip: Clip = { frames: [{ asset: 'atlas' }], fps: 12, loop: false };
  const input = { schemaVersion: 2, name: '伙伴', renderer: 'sprite', width: 256, height: 256,
    skins: [{ id: 'one', assets: { atlas: '角色.png' } }],
    actions: { idle: { ...clip, loop: true }, pet: { ...clip, variants: [clip] }, look: { ...clip, weight: 2, cooldownMs: 45000 }, blink: clip } };
  const assets = { '角色.png': 'data:image/png;base64,test' };
  it('preserves optional semantic actions, variants and bounded behavior metadata', () => {
    const result = validatePack(input, assets);
    expect(result.schemaVersion).toBe(2); expect(result.actions.pet?.variants).toHaveLength(1);
    expect(result.actions.look?.weight).toBe(2); expect(result.actions.blink).toBeDefined();
  });
  it('rejects unknown actions, nested variants and missing variant resources', () => {
    expect(() => validatePack({ ...input, actions: { ...input.actions, runScript: clip } }, assets)).toThrow('未知动作');
    expect(() => validatePack({ ...input, actions: { ...input.actions, pet: { ...clip, variants: [{ ...clip, variants: [clip] }] } } }, assets)).toThrow('只能包含动画字段');
    expect(() => validatePack({ ...input, actions: { ...input.actions, pet: { ...clip, variants: [{ ...clip, frames: [{ asset: 'missing' }] }] } } }, assets)).toThrow('缺失的图片');
  });
  it('does not silently upgrade v1 or accept unsafe timing and endless micro motions', () => {
    expect(() => validatePack({ ...input, schemaVersion: 1 }, assets)).toThrow();
    for (const actions of [
      { ...input.actions, blink: { ...clip, loop: true } },
      { ...input.actions, pet: { ...clip, variants: Array(5).fill(clip) } },
      { ...input.actions, sleepy: { ...clip, loop: true, durationMs: Infinity } },
      { ...input.actions, look: { ...clip, weight: 0 } },
    ]) expect(() => validatePack({ ...input, actions }, assets)).toThrow();
  });
});
describe('ambient variety over time', () => {
  it('respects per-motion cooldown and retains only recent history', () => {
    const p = defaultSnapshot().preferences;
    let state = { ...ambientInitial(), nextAt: 1000, observedAt: 1000 };
    state = ambientStep(state, 1000, p, true, 0, builtins[1]);
    expect(state.motion).toBe('stretch'); expect(state.until).toBeCloseTo(1000 + 32000 / 12);
    state = { ...state, motion: 'idle', last: null, nextAt: 6000, observedAt: 6000 };
    expect(ambientStep(state, 6000, p, true, 0, builtins[1]).motion).not.toBe('stretch');
    const blocked = { ...state, cooldowns: { stretch: 100000, look: 100000, doze: 100000 } };
    expect(ambientStep(blocked, 6000, p, true, 0).motion).toBe('idle');
    expect(ambientStep({ ...state, history: Array(5).fill('look'), cooldowns: {} }, 6000, p, true, 0).history).toHaveLength(5);
  });
});
