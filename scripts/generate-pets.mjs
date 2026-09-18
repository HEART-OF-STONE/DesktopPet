import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original vector artwork. Raster exports exercise exactly the same PNG pipeline as imported pets.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actions = ['idle', 'pet', 'happy', 'sleepy', 'drag', 'celebrate'];
const frameSize=768,columns=4;
function cat(color, action = 'idle', frame = 0) {
  const phase = frame / 12 * Math.PI * 2;
  const bounce = action === 'happy' || action === 'celebrate' ? Math.abs(Math.sin(phase)) * -12 : Math.sin(phase) * 2;
  const sleepy = action === 'sleepy' || (action === 'idle' && frame === 8);
  const happy = action === 'pet' || action === 'happy' || action === 'celebrate';
  const eyes = sleepy || happy
    ? '<path d="M91 142q7 -7 14 0m46 0q7 -7 14 0" fill="none" stroke="#4b5146" stroke-width="5" stroke-linecap="round"/>'
    : '<ellipse cx="98" cy="140" rx="4.5" ry="7" fill="#4b5146"/><ellipse cx="158" cy="140" rx="4.5" ry="7" fill="#4b5146"/><circle cx="99" cy="138" r="1.4" fill="#fff"/><circle cx="159" cy="138" r="1.4" fill="#fff"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <ellipse cx="128" cy="224" rx="64" ry="9" fill="#5d6849" opacity=".10"/>
  <g transform="translate(0 ${bounce})">
    <path d="M191 179q36-36 39-5q2 25-35 25" fill="${color}" stroke="#5b6151" stroke-width="4"/>
    <path d="M62 105L56 54q1-14 14-4l32 25q26-8 51 0l34-27q13-8 12 7l-5 52q23 26 18 62q-6 50-82 51q-76 0-83-48q-5-37 15-67Z" fill="${color}" stroke="#5b6151" stroke-width="4" stroke-linejoin="round"/>
    <path d="m67 66 4 32 17-16Z" fill="#e4a99c" opacity=".8"/><path d="m188 65-22 19 18 12Z" fill="#e4a99c" opacity=".8"/>
    <ellipse cx="126" cy="186" rx="42" ry="24" fill="#fff8e9" opacity=".6"/>
    <ellipse cx="78" cy="156" rx="11" ry="6" fill="#eaaea0" opacity=".72"/><ellipse cx="178" cy="156" rx="11" ry="6" fill="#eaaea0" opacity=".72"/>
    ${eyes}
    <path d="m124 151 4 3 4-3m-4 3v5m-8 1q4 5 8-1q4 6 8 1" stroke="#5b6151" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M94 202v10m62-10v10" stroke="#aaa38d" stroke-width="3" stroke-linecap="round"/>
    <path d="M127 74q-18-23 0-27q16 8 0 27Z" fill="#819c74"/><path d="M129 74q2-28 23-23q6 18-23 23Z" fill="#9eb18c"/>
  </g>
  ${action === 'celebrate' ? '<path d="m36 64 3-10 3 10 10 3-10 3-3 10-3-10-10-3Z" fill="#dca55b"/><path d="m213 42 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z" fill="#c49379"/>' : ''}
  </svg>`;
}
for (const [skin,color] of [['cream','#eee2c8'],['sage','#c1d1b6']]) {
  const dir=path.join(root,'public','pets',skin); await mkdir(dir,{recursive:true});
  await sharp(Buffer.from(cat(color)),{density:216}).png().toFile(path.join(dir,'portrait.png'));
  for (const action of actions) {
    const frames=await Promise.all(Array.from({length:12},async(_,i)=>({input:await sharp(Buffer.from(cat(color,action,i)),{density:216}).png().toBuffer(),left:(i%columns)*frameSize,top:Math.floor(i/columns)*frameSize})));
    await sharp({create:{width:columns*frameSize,height:3*frameSize,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(frames).png().toFile(path.join(dir,`${action}.png`));
  }
}
const icons=path.join(root,'src-tauri','icons'); await mkdir(icons,{recursive:true});
const png=await sharp(Buffer.from(cat('#eee2c8'))).png().toBuffer();
await writeFile(path.join(icons,'icon.png'),png);
const header=Buffer.alloc(22); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await writeFile(path.join(icons,'icon.ico'),Buffer.concat([header,png]));
console.log('Generated two original PNG character sets and app icons.');
