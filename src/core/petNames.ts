import type { PetPack, Preferences } from './types';

export function normalizePetName(value: string): string {
  const name = value.trim();
  if (!name || Array.from(name).length > 24) throw new Error('名字需要 1–24 个字符');
  if (/[\u0000-\u001f\u007f-\u009f]/.test(name)) throw new Error('名字不能包含换行或控制字符');
  return name;
}

export function petDisplayName(pack: PetPack, preferences: Preferences): string {
  const name = preferences.petNames?.[pack.id];
  if (typeof name === 'string') {
    try { return normalizePetName(name); } catch { /* Keep legacy or damaged preferences usable. */ }
  }
  return petDefaultName(pack, preferences);
}

export function petDefaultName(pack: PetPack, preferences: Preferences): string {
  const name = preferences.petDefaultNames?.[pack.id];
  if (typeof name === 'string') {
    try { return normalizePetName(name); } catch { /* Fall back to the supplied character name. */ }
  }
  return pack.name;
}
