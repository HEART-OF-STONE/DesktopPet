import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/pets/cream');
const save = async (directory, manifest) => writeFile(path.join(directory, 'pet.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const base = { schemaVersion: 1, renderer: 'sprite', width: 256, height: 256, author: 'DesktopPet', license: '项目原创演示素材' };

const sheetDir = path.join(root, 'examples/sprite-sheet');
await mkdir(sheetDir, { recursive: true });
await copyFile(path.join(source, 'idle.png'), path.join(sheetDir, 'idle.png'));
await copyFile(path.join(source, 'pet.png'), path.join(sheetDir, 'pet.png'));
await save(sheetDir, { ...base, name: '豆包 · 精灵图示例', description: '一张图片包含多帧，按矩形依次播放。',
  skins: [{ id: 'cream', name: '奶油白', color: '#e9dcc3', assets: { idle: 'idle.png', pet: 'pet.png' } }],
  actions: Object.fromEntries(['idle', 'pet'].map(action => [action, { fps: 12, loop: action === 'idle',
    frames: Array.from({ length: 12 }, (_, i) => ({ asset: action, x: i * 256, y: 0, width: 256, height: 256 })) }])) });

const sequenceDir = path.join(root, 'examples/png-sequence');
await mkdir(sequenceDir, { recursive: true });
const assets = {};
const frames = [];
for (let i = 0; i < 12; i++) {
  const asset = `frame${i}`, name = `待机-${String(i + 1).padStart(2, '0')}.png`;
  await sharp(path.join(source, 'idle.png')).extract({ left: i * 256, top: 0, width: 256, height: 256 }).png().toFile(path.join(sequenceDir, name));
  assets[asset] = name; frames.push({ asset });
}
await save(sequenceDir, { ...base, name: '豆包 · PNG 序列示例', description: '独立 PNG 图片按清单指定顺序播放。',
  skins: [{ id: 'cream', name: '奶油白', color: '#e9dcc3', assets }], actions: { idle: { fps: 12, loop: true, frames } } });
console.log('Generated importable sprite-sheet and PNG-sequence examples.');
