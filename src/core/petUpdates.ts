import type { PetPack, Snapshot } from './types';

/** Replace an explicitly chosen imported role without changing its identity. */
export function replaceImportedPet(snapshot: Snapshot, id: string, pack: PetPack): Snapshot {
  if (!id.startsWith('custom-')) throw new Error('只能更新已导入角色的素材');
  const index = snapshot.customPets.findIndex(p => p.id === id);
  if (index < 0) throw new Error('要更新的角色已不存在，请重新选择');
  if (!pack.skins.length) throw new Error('角色包需要至少一套皮肤');
  const customPets = [...snapshot.customPets];
  customPets[index] = { ...pack, id };
  const preferences = snapshot.preferences;
  return { ...snapshot, customPets, preferences: preferences.petId === id && !pack.skins.some(s => s.id === preferences.skinId)
    ? { ...preferences, skinId: pack.skins[0].id } : preferences };
}
