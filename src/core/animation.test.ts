import { describe, it, expect } from 'vitest';
import { frameAt, transitionTimer, remaining } from './animation';
import { validatePack } from './packs';
import { defaultSnapshot } from './types';

describe('animation playback', () => {
  const clip = { frames: [{asset:'a'}, {asset:'b'}, {asset:'c'}], fps: 10, loop: true };
  it('uses elapsed time and wraps across dropped render frames', () => {
    expect(frameAt(clip, 250).index).toBe(2);
    expect(frameAt(clip, 1250).index).toBe(0);
    expect(frameAt(clip, -1).index).toBe(0);
  });
  it('clamps a one-shot to its last frame and signals completion', () => {
    expect(frameAt({...clip, loop:false}, 10000)).toEqual({index:2, done:true});
  });
});
describe('timer transitions', () => {
  it('preserves time across pause and resume and completes only once', () => {
    const running = transitionTimer(defaultSnapshot().timer, 'start', 1, 1000);
    const paused = transitionTimer(running, 'pause', 1, 21000);
    expect(remaining(paused, 99000)).toBe(40000);
    const resumed = transitionTimer(paused, 'resume', 1, 200000);
    const done = transitionTimer(resumed, 'tick', 1, 250000);
    expect(done.status).toBe('done');
    expect(transitionTimer(done, 'tick', 1, 260000)).toBe(done);
  });
  it('handles overdue pause and rejects non-finite durations', () => {
    const running = transitionTimer(defaultSnapshot().timer, 'start', 1, 0);
    expect(transitionTimer(running, 'pause', 1, 90000).status).toBe('done');
    expect(() => transitionTimer(running, 'start', NaN)).toThrow();
  });
});
describe('untrusted role manifests', () => {
  const input = {schemaVersion:1, name:'猫', renderer:'sprite', width:256, height:256,
    skins:[{id:'one', assets:{a:'cat.png'}}], actions:{idle:{frames:[{asset:'a'}], fps:12, loop:true}}};
  it('resolves local PNG resources into sanitized packs', () => {
    expect(validatePack(input, {'cat.png':'data:image/png;base64,abc'}).renderer).toBe('sprite');
  });
  it('rejects path traversal and remote resources', () => {
    for (const bad of ['../cat.png', 'https://host/cat.png', 'C:\\cat.png']) {
      expect(() => validatePack({...input, skins:[{id:'one',assets:{a:bad}}]}, {})).toThrow();
    }
  });
  it('rejects missing per-skin assets and invalid timing', () => {
    expect(() => validatePack({...input, skins:[{id:'one',assets:{}}]}, {})).toThrow();
    expect(() => validatePack({...input, actions:{idle:{frames:[{asset:'a'}],fps:0,loop:true}}}, {'cat.png':'data:image/png;base64,a'})).toThrow();
  });
});
