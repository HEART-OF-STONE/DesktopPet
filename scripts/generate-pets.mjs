import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cat } from './pet-art.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(await readFile(path.join(root, 'src/core/builtinMotions.json'), 'utf8'));
const { frameSize, columns } = layout;
for (const [skin, color] of [['cream', '#eee2c8'], ['sage', '#c1d1b6']]) {
  const dir = path.join(root, 'public', 'pets', skin); await mkdir(dir, { recursive: true });
  await sharp(Buffer.from(cat(color)), { density: 216 }).resize(768, 768).png().toFile(path.join(dir, 'portrait.png'));
  for (const [action, spec] of Object.entries(layout.motions)) for (let variant = 0; variant <= (spec.variants || 0); variant++) {
    const frames = await Promise.all(Array.from({ length: spec.count }, async (_, i) => ({
      input: await sharp(Buffer.from(cat(color, action, i, spec.count, variant)), { density: 72 * frameSize / 256 }).resize(frameSize, frameSize).png().toBuffer(),
      left: (i % columns) * frameSize, top: Math.floor(i / columns) * frameSize,
    })));
    const key = variant ? `${action}-${variant}` : action;
    await sharp({ create: { width: columns * frameSize, height: Math.ceil(spec.count / columns) * frameSize,
      channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(frames).png().toFile(path.join(dir, `${key}.png`));
  }
}
console.log('Generated articulated character actions, variants and independent idle micro motions.');
