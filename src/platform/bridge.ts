import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { defaultSnapshot, type Snapshot, type Preferences, type PetPack, type Action, type HitRegion } from '../core/types';
import { transitionTimer } from '../core/animation';
import { normalizePetName } from '../core/petNames';

export const desktop = isTauri();
const key = 'desktop-pet-preview-v1';
let browserState = defaultSnapshot();
if (!desktop) {
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.customPets) && saved.timer && saved.preferences)
      browserState = { ...browserState, ...saved, preferences: { ...browserState.preferences, ...saved.preferences } };
  } catch { /* A bad preview save must not prevent the app from opening. */ }
}
function browserCommit(next: Snapshot): Snapshot {
  localStorage.setItem(key, JSON.stringify(next));
  browserState = next;
  window.dispatchEvent(new CustomEvent('state-changed', { detail: next }));
  return next;
}
export async function subscribe<T>(topic: string, fn: (value: T) => void): Promise<() => void> {
  if (desktop) return listen<T>(topic, event => fn(event.payload));
  const listener = (event: Event) => fn((event as CustomEvent<T>).detail);
  window.addEventListener(topic, listener);
  return () => window.removeEventListener(topic, listener);
}
export const getSnapshot = () => desktop ? invoke<Snapshot>('get_snapshot') : Promise.resolve(browserState);
export async function previewAmbient(kind:string){if(desktop)return invoke<void>('preview_ambient',{kind});window.dispatchEvent(new CustomEvent('ambient-preview',{detail:kind}));}
export async function updatePreferences(patch: Partial<Preferences>): Promise<Snapshot> {
  if (desktop) return invoke('update_preferences', { patch });
  return browserCommit({ ...browserState, preferences: { ...browserState.preferences, ...patch } });
}
export async function renamePet(id: string, name: string | null, defaultName?: string): Promise<void> {
  const snapshot = await getSnapshot();
  const petNames = { ...snapshot.preferences.petNames };
  const petDefaultNames = { ...snapshot.preferences.petDefaultNames };
  if (defaultName !== undefined) petDefaultNames[id] = normalizePetName(defaultName);
  if (name === null) delete petNames[id];
  else petNames[id] = normalizePetName(name);
  await updatePreferences({ petNames, petDefaultNames });
}
export async function timerAction(action: string, minutes?: number): Promise<Snapshot> {
  if (desktop) return invoke('timer_action', { action, minutes });
  return browserCommit({ ...browserState, timer: transitionTimer(browserState.timer, action, minutes) });
}
export async function addPet(pack: PetPack): Promise<Snapshot> {
  if (desktop) return invoke('add_pet', { pack });
  if (browserState.customPets.length >= 6) throw new Error('最多导入 6 个角色，请先移除一个');
  return browserCommit({ ...browserState, customPets: [...browserState.customPets, pack], preferences: { ...browserState.preferences, petId: pack.id, skinId: pack.skins[0].id } });
}
export async function removePet(id: string): Promise<Snapshot> {
  if (desktop) return invoke('remove_pet', { id });
  const prefs = browserState.preferences.petId === id ? { ...browserState.preferences, petId: 'doubao-static', skinId: 'cream' } : browserState.preferences;
  const petNames = { ...prefs.petNames }; delete petNames[id];
  const petDefaultNames = { ...prefs.petDefaultNames }; delete petDefaultNames[id];
  return browserCommit({ ...browserState, preferences: { ...prefs, petNames, petDefaultNames }, customPets: browserState.customPets.filter(p => p.id !== id) });
}
export async function triggerAction(action: Action): Promise<void> {
  if (desktop) return invoke('trigger_action', { action });
  window.dispatchEvent(new CustomEvent('pet-action', { detail: action }));
}
export async function desktopAction(action: string): Promise<void> {
  if (desktop) return invoke('desktop_action', { action });
  if (action === 'hide') await updatePreferences({ petVisible: false });
  if (action === 'reset-position') await updatePreferences({ petVisible: true });
}
export const beginDrag = () => invoke('begin_drag');
export const reportHitRegions = (regions: HitRegion[],placement?:HitRegion,reposition=false,anchor?:HitRegion) => desktop ? invoke<HitRegion>('update_hit_regions', { regions,placement,reposition,anchor }) : Promise.resolve(undefined);
if (!desktop) setInterval(() => {
  const next = transitionTimer(browserState.timer, 'tick');
  if (next !== browserState.timer) { try { browserCommit({ ...browserState, timer: next }); } catch { /* UI can still stop/reset the timer. */ } }
}, 500);
