import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { cat } from './pet-art.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/pets/cream');
const layout = JSON.parse(await readFile(path.join(root, 'src/core/builtinMotions.json'), 'utf8'));
const save = async (directory, manifest) => writeFile(path.join(directory, 'pet.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const base = { schemaVersion: 1, renderer: 'sprite', width: 256, height: 256, author: 'HEART-OF-STONE and DesktopPet contributors', license: 'MIT', licenseUrl: 'https://github.com/HEART-OF-STONE/DesktopPet/blob/main/LICENSE', licenseText: await readFile(path.join(root, 'LICENSE'), 'utf8') };

const sheetDir = path.join(root, 'examples/sprite-sheet');
await mkdir(sheetDir, { recursive: true });
await copyFile(path.join(source, 'idle.png'), path.join(sheetDir, 'idle.png'));
await copyFile(path.join(source, 'pet.png'), path.join(sheetDir, 'pet.png'));
await save(sheetDir, { ...base, name: '啾咪 · 精灵图示例', description: '一张图片包含多帧，按矩形依次播放。',
  skins: [{ id: 'cream', name: '奶油白', color: '#e9dcc3', assets: { idle: 'idle.png', pet: 'pet.png' } }],
  actions: Object.fromEntries(['idle', 'pet'].map(action => [action, { fps: layout.motions[action].fps, loop: action === 'idle',
    frames: Array.from({ length: layout.motions[action].count }, (_, i) => ({ asset: action, x: (i % layout.columns) * layout.frameSize, y: Math.floor(i / layout.columns) * layout.frameSize, width: layout.frameSize, height: layout.frameSize })) }])) });

const sequenceDir = path.join(root, 'examples/png-sequence');
await mkdir(sequenceDir, { recursive: true });
const assets = {};
const frames = [];
for (let i = 0; i < 12; i++) {
  const asset = `frame${i}`, name = `待机-${String(i + 1).padStart(2, '0')}.png`;
  const frame = i * 2;
  await sharp(path.join(source, 'idle.png')).extract({ left: (frame % layout.columns) * layout.frameSize, top: Math.floor(frame / layout.columns) * layout.frameSize, width: layout.frameSize, height: layout.frameSize }).png().toFile(path.join(sequenceDir, name));
  assets[asset] = name; frames.push({ asset });
}
await save(sequenceDir, { ...base, name: '啾咪 · PNG 序列示例', description: '独立 PNG 图片按清单指定顺序播放。',
  skins: [{ id: 'cream', name: '奶油白', color: '#e9dcc3', assets }], actions: { idle: { fps: 3, loop: true, frames } } });

// Share identical poses, keep common idle poses at 2x resolution, and preserve
// each clip's duration while sampling the compact example at a lower frame rate.
// Built-in motions retain their original frame rates and 512px frames.
const v2Dir = path.join(root, 'examples/motion-pack-v2'); await mkdir(v2Dir, { recursive: true });
const cell = 256, cols = 16, rows = 16, tiles = new Map(), references = [], actions = {};
for (const [action, spec] of Object.entries(layout.motions)) {
  const targetFps = ['idle', 'sleepy', 'thinking'].includes(action) ? 2
    : ['doze', 'drag'].includes(action) ? 4 : ['blink', 'ear'].includes(action) ? spec.fps : Math.min(7.5, spec.fps);
  const count = Math.max(2, Math.round(spec.count * targetFps / spec.fps));
  const clips = [];
  for (let variant = 0; variant <= (spec.variants || 0); variant++) {
    const frames = [];
    for (let i = 0; i < count; i++) {
      // Rasterize the vector at its destination resolution before resizing.
      const raw = await sharp(Buffer.from(cat('#eee2c8', action, i, count, variant)), { density: 144 }).resize(512, 512).ensureAlpha().raw().toBuffer();
      const hash = createHash('sha256').update(raw).digest('hex'), size = action === 'idle' ? 512 : cell;
      let tile = tiles.get(hash);
      if (!tile) { tile = { size: 0 }; tiles.set(hash, tile); }
      if (size > tile.size) {
        tile.size = size;
        tile.input = await sharp(raw, { raw: { width: 512, height: 512, channels: 4 } }).resize(size, size).png().toBuffer();
      }
      const frame = { asset: 'atlas' }; references.push({ frame, tile }); frames.push(frame);
    }
    clips.push({ frames, fps: count * spec.fps / spec.count, loop: spec.loop, ...(spec.durationMs ? { durationMs: spec.durationMs } : {}) });
  }
  actions[action] = { ...clips[0], ...(clips.length > 1 ? { variants: clips.slice(1) } : {}) };
}
// Place larger tiles first so all 256/512px rectangles fit inside a 16 Mi-pixel atlas.
const occupied = new Uint8Array(cols * rows), ordered = [...tiles.values()].sort((a, b) => b.size - a.size);
let atlasHeight = 0;
for (const tile of ordered) {
  const units = tile.size / cell; let placed = false;
  for (let y = 0; y <= rows - units && !placed; y++) for (let x = 0; x <= cols - units && !placed; x++) {
    let free = true;
    for (let dy = 0; dy < units; dy++) for (let dx = 0; dx < units; dx++) if (occupied[(y + dy) * cols + x + dx]) free = false;
    if (!free) continue;
    for (let dy = 0; dy < units; dy++) for (let dx = 0; dx < units; dx++) occupied[(y + dy) * cols + x + dx] = 1;
    tile.left = x * cell; tile.top = y * cell; atlasHeight = Math.max(atlasHeight, tile.top + tile.size); placed = true;
  }
  if (!placed) throw new Error('The v2 example exceeds its 16 Mi-pixel budget; adjust the sample frame rates.');
}
for (const { frame, tile } of references) Object.assign(frame, { x: tile.left, y: tile.top, width: tile.size, height: tile.size });
actions.doze.weight = .4; actions.doze.cooldownMs = 180000;
await sharp({ create: { width: cols * cell, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(ordered.map(({ input, left, top }) => ({ input, left, top })))
  .png({ palette: true, colours: 256, dither: 0, effort: 7 }).toFile(path.join(v2Dir, 'pet.png'));
await save(v2Dir, { ...base, schemaVersion: 2, name: '啾咪 · 丰富动作示例', description: '包含独立小动作、姿势和多种互动回应。',
  skins: [{ id: 'cream', name: '奶油白', color: '#e9dcc3', assets: { atlas: 'pet.png' } }], actions });
console.log(`Generated v1 examples and a v2 motion pack: ${references.length} frames share ${tiles.size} poses at 256/512px.`);
