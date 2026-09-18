export const ACTIONS = ['idle', 'pet', 'happy', 'sleepy', 'drag', 'celebrate'] as const;
export type Action = typeof ACTIONS[number];
export type AmbientMotion = 'stretch' | 'look' | 'doze' | 'stroll';
export type PetMotion = Action | 'thinking' | 'attention' | 'error' | AmbientMotion;
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
  panelSide: 'auto'|'left'|'right'; panelScale: number; avoidFullscreen: boolean;
  petNames: Record<string, string>;
  petDefaultNames: Record<string, string>;
  bubbleOffsetX: number; bubbleOffsetY: number;
  ambientEnabled: boolean; ambientFrequency: 'low'|'normal'|'lively'; ambientRange: 'still'|'small'|'medium';
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
    volume: 0.25, topmost: true, snap: true, quiet: false, petVisible: true, panelSide:'auto',panelScale:1,avoidFullscreen:true,petNames: {}, petDefaultNames: {}, bubbleOffsetX:0,bubbleOffsetY:0,ambientEnabled:true,ambientFrequency:'normal',ambientRange:'still' },
  timer: { status: 'idle', durationMs: 25 * 60000, remainingMs: 25 * 60000, endsAt: null },
  customPets: [],
});
