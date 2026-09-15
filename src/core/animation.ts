import type { Clip, TimerState } from './types';

/** Elapsed time, not render count, determines playback speed. */
export function frameAt(clip: Clip, elapsedMs: number): { index: number; done: boolean } {
  const frame = Math.floor(Math.max(0, elapsedMs) * clip.fps / 1000);
  const count = clip.frames.length;
  return { index: clip.loop ? frame % count : Math.min(frame, count - 1), done: !clip.loop && frame >= count };
}
export function remaining(timer: TimerState, now = Date.now()): number {
  return timer.status === 'running' && timer.endsAt !== null
    ? Math.max(0, timer.endsAt - now) : timer.remainingMs;
}
export function formatTime(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export function transitionTimer(timer: TimerState, action: string, minutes = 25, now = Date.now()): TimerState {
  if (action === 'start') {
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) throw new Error('计时时长应在 1–180 分钟之间');
    const durationMs = Math.round(minutes * 60000);
    return { status: 'running', durationMs, remainingMs: durationMs, endsAt: now + durationMs };
  }
  if (action === 'pause' && timer.status === 'running') {
    const left = remaining(timer, now);
    return { ...timer, status: left ? 'paused' : 'done', remainingMs: left, endsAt: null };
  }
  if (action === 'resume' && timer.status === 'paused') return { ...timer, status: 'running', endsAt: now + timer.remainingMs };
  if (action === 'tick' && timer.status === 'running' && remaining(timer, now) === 0)
    return { ...timer, status: 'done', remainingMs: 0, endsAt: null };
  if (action === 'reset') return { ...timer, status: 'idle', remainingMs: timer.durationMs, endsAt: null };
  return timer;
}
