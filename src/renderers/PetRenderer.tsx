import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { frameAt } from '../core/animation';
import { microDelay, microMotions, motionDuration, resolveMotion } from '../core/motions';
import type { PetMotion, HitRegion, PetPack, Skin } from '../core/types';

interface Props {
  pack: PetPack; skin: Skin; action?: PetMotion; sequence?: number; size?: number;
  pressed?: boolean; flipped?: boolean; paused?: boolean; continuous?: boolean; idleDetails?: boolean;
  onRegions?: (regions: HitRegion[]) => void; onComplete?: (action: PetMotion, sequence: number) => void;
  displayName?: string;
}
// A bounded cache shared by previews avoids repeated decoding on every action.
const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) { imageCache.delete(src); imageCache.set(src, cached); return cached; }
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => { imageCache.delete(src); reject(new Error('图片加载失败')); }; image.src = src;
  });
  imageCache.set(src, pending);
  while (imageCache.size > 6) imageCache.delete(imageCache.keys().next().value!);
  return pending;
}
export function PetRenderer({ pack, skin, action = 'idle', sequence = 0, size = 256, pressed = false, flipped = false,
  paused = false, continuous = false, idleDetails = true, onRegions, onComplete, displayName = pack.name }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onRegions, onComplete }); callbacks.current = { onRegions, onComplete };
  const [active, setActive] = useState<PetMotion>(action);
  const microCounts = useRef<Partial<Record<typeof microMotions[number], number>>>({});
  const [error, setError] = useState('');
  const [pixelRatio, setPixelRatio] = useState(() => window.devicePixelRatio || 1);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ratio = Math.min(size / pack.width, size / pack.height);
  const density = Math.min(Math.max(pixelRatio, 1), 4, 2048 / Math.max(pack.width * ratio, pack.height * ratio));
  const bufferWidth = Math.max(1, Math.round(pack.width * ratio * density)), bufferHeight = Math.max(1, Math.round(pack.height * ratio * density));
  useEffect(() => { microCounts.current = {}; }, [pack.id, skin.id]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    let query: MediaQueryList;
    const refresh = () => { const dpr = window.devicePixelRatio || 1; setPixelRatio(dpr); query?.removeEventListener('change', refresh); query = window.matchMedia(`(min-resolution: ${dpr - .001}dppx) and (max-resolution: ${dpr + .001}dppx)`); query.addEventListener('change', refresh); };
    refresh(); window.addEventListener('resize', refresh);
    return () => { query.removeEventListener('change', refresh); window.removeEventListener('resize', refresh); };
  }, []);
  useEffect(() => {
    const element = canvas.current!, context = element.getContext('2d', { willReadFrequently: true })!;
    context.setTransform(bufferWidth / pack.width, 0, 0, bufferHeight / pack.height, 0, 0);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    const resolved = resolveMotion(pack, action, sequence);
    const idle = resolveMotion(pack, action === 'thinking' && resolved.clip.loop ? 'thinking' : 'idle', sequence).clip;
    const limit = continuous ? Infinity : motionDuration(pack, action, sequence);
    let currentClip = resolved.clip, start = 0, idleStart = 0, actionStart = 0;
    let cancelled = false, animation = 0, pauseAt: number | null = null, lastFrame = -1, lastReport = 0, completed = false, micro = false;
    let regions: HitRegion[] = [];
    const resources = new Map<string, HTMLImageElement>();
    const maskCanvas = document.createElement('canvas'); maskCanvas.width = 32; maskCanvas.height = 32;
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })!;
    const clipCache = new Map<string, HitRegion[]>();
    const schedule = Object.fromEntries(microMotions.map(m => [m, performance.now() + microDelay(m, Math.random())])) as Record<typeof microMotions[number], number>;
    setActive(action); setError('');
    const report = () => {
      if (!callbacks.current.onRegions) return;
      const box = element.getBoundingClientRect();
      callbacks.current.onRegions(regions.map(r => ({ x: box.x + r.x * box.width, y: box.y + r.y * box.height, width: r.width * box.width, height: r.height * box.height })));
    };
    const draw = (time: number) => {
      if (cancelled) return;
      const currentDpr = window.devicePixelRatio || 1;
      if (Math.abs(currentDpr - pixelRatio) > .001) { setPixelRatio(currentDpr); return; }
      if (document.hidden || paused) { pauseAt ??= time; animation = requestAnimationFrame(draw); return; }
      if (pauseAt !== null) {
        const gap = time - pauseAt; start += gap; idleStart += gap; actionStart += gap;
        for (const m of microMotions) schedule[m] = time + microDelay(m, Math.random());
        pauseAt = null;
      }
      if (micro && frameAt(currentClip, time - start).done) { micro = false; currentClip = idle; start = idleStart; lastFrame = -1; setActive(action); }
      if (action !== 'idle' && !completed && (time - actionStart >= limit || resolved.native && pack.renderer === 'sprite' && !continuous && frameAt(resolved.clip, time - actionStart).done)) {
        completed = true; currentClip = idle; start = time; idleStart = time; lastFrame = -1; setActive('idle');
        callbacks.current.onComplete?.(action, sequence);
      }
      if ((action === 'idle' || action === 'thinking') && !completed && !micro && idleDetails && !reduced && pack.renderer === 'sprite') {
        const due = microMotions.filter(m => pack.actions[m] && time >= schedule[m]).sort((a, b) => schedule[a] - schedule[b])[0];
        if (due) {
          const token = (microCounts.current[due] || 0) + 1, clip = resolveMotion(pack, due, token).clip;
          schedule[due] = time + microDelay(due, Math.random());
          if (clip.frames.every(f => resources.has(f.asset))) { microCounts.current[due] = token; micro = true; currentClip = clip; start = time; lastFrame = -1; setActive(due); }
        }
      }
      const index = reduced || pack.renderer === 'static' ? 0 : frameAt(currentClip, time - start).index, frame = currentClip.frames[index];
      if (lastFrame !== index) {
        const image = resources.get(frame.asset)!;
        context.clearRect(0, 0, pack.width, pack.height); context.save();
        if (flipped) { context.translate(pack.width, 0); context.scale(-1, 1); }
        if (frame.x !== undefined) context.drawImage(image, frame.x, frame.y!, frame.width!, frame.height!, 0, 0, pack.width, pack.height);
        else { const fit = Math.min(pack.width / image.width, pack.height / image.height), w = image.width * fit, h = image.height * fit; context.drawImage(image, (pack.width - w) / 2, (pack.height - h) / 2, w, h); }
        context.restore(); lastFrame = index;
        if (callbacks.current.onRegions) {
          const cacheKey = JSON.stringify(frame);
          if (!clipCache.has(cacheKey)) {
            maskContext.clearRect(0, 0, 32, 32); maskContext.drawImage(element, 0, 0, 32, 32);
            const pixels = maskContext.getImageData(0, 0, 32, 32).data, mask: HitRegion[] = [];
            for (let y = 0; y < 32; y++) { let x = 0; while (x < 32) { while (x < 32 && pixels[(y * 32 + x) * 4 + 3] < 30) x++; const begin = x; while (x < 32 && pixels[(y * 32 + x) * 4 + 3] >= 30) x++; if (x > begin) mask.push({ x: begin / 32, y: y / 32, width: (x - begin) / 32, height: 1 / 32 }); } }
            clipCache.set(cacheKey, mask);
          }
          regions = clipCache.get(cacheKey)!;
        }
      }
      if (time - lastReport > 100) { report(); lastReport = time; }
      if (pack.renderer === 'sprite' || callbacks.current.onRegions || action !== 'idle' && !completed) animation = requestAnimationFrame(draw);
    };
    const visibility = () => { if (document.hidden) pauseAt ??= performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    const keys = new Set([...currentClip.frames, ...idle.frames].map(f => f.asset));
    Promise.all([...keys].map(async key => { resources.set(key, await loadImage(skin.assets[key])); })).then(() => {
      if (cancelled) return;
      start = idleStart = actionStart = performance.now(); animation = requestAnimationFrame(draw);
      if ((action === 'idle' || action === 'thinking') && idleDetails && !reduced) for (const m of microMotions) {
        const definition = pack.actions[m];
        if (definition) for (const key of new Set([definition, ...(definition.variants || [])].flatMap(clip => clip.frames.map(f => f.asset)))) {
          void loadImage(skin.assets[key]).then(image => { if (!cancelled) resources.set(key, image); }).catch(() => {});
        }
      }
    }).catch(e => { if (!cancelled) { setError(String(e)); callbacks.current.onComplete?.(action, sequence); } });
    return () => { cancelled = true; cancelAnimationFrame(animation); document.removeEventListener('visibilitychange', visibility); resources.clear(); clipCache.clear(); };
  }, [pack, skin, action, sequence, flipped, paused, continuous, idleDetails, reduced, bufferWidth, bufferHeight, pixelRatio]);
  const native = pack.renderer === 'sprite' && !!pack.actions[active];
  const duration = motionDuration(pack, action, sequence);
  return <div className={`pet-art action-${active} ${native ? 'has-motion' : 'procedural-motion'} ${pressed ? 'is-pressed' : ''}`}
    data-motion={active} data-variant={resolveMotion(pack, action, sequence).variant + 1}
    style={{ width: pack.width * ratio, height: pack.height * ratio, '--motion-duration': `${Number.isFinite(duration) ? duration : 4000}ms` } as CSSProperties}>
    <canvas ref={canvas} width={bufferWidth} height={bufferHeight} role="img" aria-label={`${displayName}，${pack.renderer === 'static' ? '静态图片' : '逐帧动画'}`} />
    {error && <span className="asset-error">图片暂时无法显示</span>}
  </div>;
}
