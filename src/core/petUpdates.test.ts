import { expect, it } from 'vitest';
import { builtins } from './packs';
import { replaceImportedPet } from './petUpdates';
import { defaultSnapshot, type PetPack } from './types';

const role = (id: string): PetPack => ({ ...builtins[1], id });

it('updates a role in a full wardrobe while preserving identity, names, order and selected skin', () => {
  const snapshot = defaultSnapshot();
  snapshot.customPets = Array.from({ length: 6 }, (_, i) => role(`custom-${i}`));
  snapshot.preferences = { ...snapshot.preferences, petId: 'custom-2', skinId: 'sage',
    petNames: { 'custom-2': '小团子' }, petDefaultNames: { 'custom-2': '年糕' } };
  const replacement = { ...role('custom-new'), name: '新版角色', description: '新版动作',
    skins: builtins[1].skins.map(s => ({ ...s, assets: { ...s.assets, idle: 'new-idle.png' } })) };
  const next = replaceImportedPet(snapshot, 'custom-2', replacement);
  expect(next.customPets.map(p => p.id)).toEqual(snapshot.customPets.map(p => p.id));
  expect(next.customPets[2]).toMatchObject({ id: 'custom-2', name: '新版角色', description: '新版动作' });
  expect(next.customPets[2].skins[1].assets.idle).toBe('new-idle.png');
  expect(next.preferences).toBe(snapshot.preferences);
  expect(next.timer).toBe(snapshot.timer);
  expect(snapshot.customPets[2].skins[1].assets.idle).not.toBe('new-idle.png');
  expect(JSON.parse(JSON.stringify(next)).preferences.petNames['custom-2']).toBe('小团子');
});

it('falls back to the first new skin only when the updated active role loses its selected skin', () => {
  const snapshot = defaultSnapshot(); snapshot.customPets = [role('custom-a')];
  snapshot.preferences = { ...snapshot.preferences, petId: 'custom-a', skinId: 'sage' };
  const next = replaceImportedPet(snapshot, 'custom-a', { ...role('custom-new'), skins: [builtins[1].skins[0]] });
  expect(next.preferences.petId).toBe('custom-a'); expect(next.preferences.skinId).toBe('cream');
  expect(snapshot.preferences.skinId).toBe('sage');
});

it('does not switch companions when updating a role that is only being previewed', () => {
  const snapshot = defaultSnapshot(); snapshot.customPets = [role('custom-a')];
  const next = replaceImportedPet(snapshot, 'custom-a', role('custom-new'));
  expect(next.preferences).toBe(snapshot.preferences);
  expect(next.customPets).toHaveLength(1); expect(next.customPets[0].id).toBe('custom-a');
});

it('rejects built-in, missing and skinless update targets without modifying the save', () => {
  const snapshot = defaultSnapshot(); snapshot.customPets = [role('custom-a')];
  const before = JSON.stringify(snapshot);
  expect(() => replaceImportedPet(snapshot, 'doubao-sprite', role('custom-new'))).toThrow('只能更新已导入角色');
  expect(() => replaceImportedPet(snapshot, 'custom-missing', role('custom-new'))).toThrow('已不存在');
  expect(() => replaceImportedPet(snapshot, 'custom-a', { ...role('custom-new'), skins: [] })).toThrow('至少一套皮肤');
  expect(JSON.stringify(snapshot)).toBe(before);
});
