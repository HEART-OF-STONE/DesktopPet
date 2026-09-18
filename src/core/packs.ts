import { ACTIONS, type PetPack, type Clip } from './types';

const colors = [{ id: 'cream', name: '奶油白', color: '#e9dcc3' }, { id: 'sage', name: '鼠尾草', color: '#a9bea3' }];
const clips = (sprite: boolean): PetPack['actions'] => Object.fromEntries(ACTIONS.map(action => [action, {
  frames: Array.from({ length: sprite ? 12 : 1 }, (_, i) => sprite
    ? { asset: action, x: (i % 4) * 768, y: Math.floor(i / 4) * 768, width: 768, height: 768 }
    : { asset: 'portrait' }),
  fps: 12, loop: action === 'idle' || action === 'sleepy' || action === 'drag',
}])) as PetPack['actions'];
export const builtins: PetPack[] = [false, true].map(sprite => ({
  schemaVersion: 1, id: `doubao-${sprite ? 'sprite' : 'static'}`, name: sprite ? '豆包 · 动画版' : '豆包',
  description: sprite ? '会眨眼，也会偷偷打瞌睡。' : '软乎乎的一小团，捏一下就很开心。',
  author: 'DesktopPet', license: '项目原创演示素材', renderer: sprite ? 'sprite' : 'static',
  width: 256, height: 256,
  skins: colors.map(skin => ({ ...skin, assets: sprite
    ? Object.fromEntries(ACTIONS.map(action => [action, `/pets/${skin.id}/${action}.png`]))
    : { portrait: `/pets/${skin.id}/portrait.png` } })), actions: clips(sprite),
}));

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const assetName = (v: unknown): v is string => typeof v === 'string' && v.length <= 120 && /\.png$/i.test(v) && !/[\\/:*?"<>|\u0000-\u001f]/.test(v) && !v.includes('..');

/** Validation is also used before restoring user packs. External resource URLs are never accepted. */
export function validatePack(input: unknown, assets: Record<string, string>): PetPack {
  assert(plain(input), '角色清单必须是 JSON 对象');
  assert(input.schemaVersion === 1, '暂不支持这个角色包版本');
  assert(input.renderer === 'static' || input.renderer === 'sprite', '首版支持静态图片与逐帧 2D');
  assert(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 40, '角色名称需要 1–40 个字符');
  assert(finite(input.width, 16, 2048) && finite(input.height, 16, 2048), '画布尺寸应在 16–2048 像素之间');
  assert(Array.isArray(input.skins) && input.skins.length >= 1 && input.skins.length <= 4, '需要 1–4 套皮肤');
  const ids = new Set<string>();
  const skins = input.skins.map((skin: any) => {
    assert(plain(skin) && typeof skin.id === 'string' && /^[\w-]{1,40}$/.test(skin.id) && !ids.has(skin.id), '皮肤 ID 无效或重复');
    ids.add(skin.id);
    assert(plain(skin.assets) && Object.keys(skin.assets).length <= 32, '皮肤需要图片资源映射');
    const resolved: Record<string, string> = {};
    for (const [key, file] of Object.entries(skin.assets)) {
      assert(/^[\w-]{1,40}$/.test(key) && assetName(file), '资源必须引用同目录的 PNG 文件');
      assert(typeof assets[file] === 'string' && assets[file].startsWith('data:image/png;base64,'), `缺少图片：${file}`);
      resolved[key] = assets[file];
    }
    return { id: skin.id, name: String(skin.name || skin.id).slice(0, 40), color: /^#[a-f\d]{6}$/i.test(skin.color) ? skin.color : '#c4cabc', assets: resolved };
  });
  assert(plain(input.actions) && plain(input.actions.idle), '角色包必须提供 idle 待机动作');
  const actions: Record<string, Clip> = {};
  for (const action of ACTIONS) {
    const clip = input.actions[action];
    if (!clip) continue;
    assert(plain(clip) && Array.isArray(clip.frames) && clip.frames.length >= 1 && clip.frames.length <= 120, `${action} 需要 1–120 帧`);
    assert(finite(clip.fps, 1, 60) && typeof clip.loop === 'boolean', `${action} 的帧率或循环设置无效`);
    const frames = clip.frames.map((frame: any) => {
      assert(plain(frame) && typeof frame.asset === 'string' && skins.every(s => Object.hasOwn(s.assets, frame.asset)), `${action} 引用了皮肤中缺失的图片`);
      const crop = [frame.x, frame.y, frame.width, frame.height];
      if (crop.some(v => v !== undefined)) {
        assert(finite(frame.x, 0, 8192) && finite(frame.y, 0, 8192) && finite(frame.width, 1, 2048) && finite(frame.height, 1, 2048), '精灵图帧区域无效');
        return { asset: frame.asset, x: frame.x, y: frame.y, width: frame.width, height: frame.height };
      }
      return { asset: frame.asset };
    });
    actions[action] = { frames, fps: clip.fps, loop: clip.loop };
  }
  return { schemaVersion: 1, id: `custom-${crypto.randomUUID()}`, name: input.name.trim(), renderer: input.renderer,
    description: String(input.description || '你带来的新伙伴').slice(0, 120), author: String(input.author || '自定义').slice(0, 60),
    license: String(input.license || '用户提供').slice(0, 120), width: input.width, height: input.height, skins,
    actions: actions as PetPack['actions'] };
}

export async function importFiles(files: File[]): Promise<PetPack> {
  assert(files.length > 0 && files.length <= 40, '一次最多选择 40 个文件');
  assert(files.every(file=>/\.(png|json)$/i.test(file.name)), '角色导入只接收 PNG 和角色 JSON，请移除说明或开发文件');
  assert(files.reduce((sum, file) => sum + file.size, 0) <= 12 * 1024 * 1024, '角色包总大小不能超过 12 MB');
  assert(new Set(files.map(f => f.name)).size === files.length, '图片文件名不能重复');
  const assets: Record<string, string> = {};
  const sizes: Record<string, { width: number; height: number }> = {};
  let pixels = 0;
  for (const file of files.filter(f => /\.png$/i.test(f.name))) {
    const header = await file.slice(0, 24).arrayBuffer();
    const signature = new Uint8Array(header);
    assert([137,80,78,71,13,10,26,10].every((n, i) => signature[i] === n), `${file.name} 不是有效的 PNG`);
    assert(header.byteLength === 24, 'PNG 文件不完整');
    const view = new DataView(header);
    const width = view.getUint32(16), height = view.getUint32(20);
    assert(width > 0 && height > 0 && width <= 8192 && height <= 8192 && pixels + width * height <= 16 * 1024 * 1024, '图片像素过大，请缩小图片或减少动画帧');
    const bitmap = await createImageBitmap(file);
    sizes[file.name] = { width: bitmap.width, height: bitmap.height };
    pixels += bitmap.width * bitmap.height;
    const valid = bitmap.width <= 8192 && bitmap.height <= 8192 && pixels <= 16 * 1024 * 1024;
    bitmap.close();
    assert(valid, '图片像素过大，请缩小图片或减少动画帧');
    assets[file.name] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file);
    });
  }
  const manifests = files.filter(f => /\.json$/i.test(f.name));
  let input: unknown;
  if (files.length === 1 && Object.keys(assets).length === 1) {
    const file = files[0];
    input = { schemaVersion: 1, name: file.name.replace(/\.png$/i, '').slice(0, 40), renderer: 'static', width: 256, height: 256,
      skins: [{ id: 'default', name: '默认', assets: { portrait: file.name } }],
      actions: { idle: { frames: [{ asset: 'portrait' }], fps: 1, loop: true } } };
  } else {
    assert(manifests.length === 1, '请选择一个 JSON 清单和它引用的 PNG 图片');
    assert(manifests[0].size <= 256 * 1024, '角色清单过大');
    input = JSON.parse(await manifests[0].text());
  }
  const pack = validatePack(input, assets);
  for (const skin of pack.skins) for (const clip of Object.values(pack.actions)) for (const frame of clip.frames) {
    if (frame.x !== undefined) {
      const filename = Object.keys(assets).find(key => assets[key] === skin.assets[frame.asset])!;
      assert(frame.x + frame.width! <= sizes[filename].width && frame.y! + frame.height! <= sizes[filename].height, '精灵图帧区域超出了图片边界');
    }
  }
  return pack;
}
