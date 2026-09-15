export const ACTIONS = ['idle', 'pet', 'happy', 'sleepy', 'drag', 'celebrate'] as const;
export type Action = typeof ACTIONS[number];
export interface Frame { asset: string; x?: number; y?: number; width?: number; height?: number }
export interface Clip { frames: Frame[]; fps: number; loop: boolean }
export interface Skin { id: string; name: string; color: string; assets: Record<string, string> }
export interface PetPack {
  schemaVersion: 1; id: string; name: string; description: string;
  author: string; license: string; renderer: 'static' | 'sprite';
  width: number; height: number; skins: Skin[];
  actions: Partial<Record<Action, Clip>> & { idle: Clip };
}
export interface Preferences {
  petId: string; skinId: string; scale: number; sound: boolean; volume: number;
  topmost: boolean; snap: boolean; quiet: boolean; petVisible: boolean;
}
export interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'done';
  durationMs: number; remainingMs: number; endsAt: number | null;
}
export interface Snapshot { version: 1; preferences: Preferences; timer: TimerState; customPets: PetPack[] }
export interface HitRegion { x: number; y: number; width: number; height: number }
export const defaultSnapshot = (): Snapshot => ({
  version: 1,
  preferences: { petId: 'doubao-static', skinId: 'cream', scale: 1, sound: false,
    volume: 0.25, topmost: true, snap: true, quiet: false, petVisible: true },
  timer: { status: 'idle', durationMs: 25 * 60000, remainingMs: 25 * 60000, endsAt: null },
  customPets: [],
});
