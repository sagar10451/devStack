import type { AnimationStep } from '../types.ts';
import { SWIPE_SECONDS } from '../swipeReveal.ts';

export const INTRO_ELECTRIC_SECONDS = .9;
export const INTRO_REVEAL_SECONDS = SWIPE_SECONDS;
export const INTRO_TYPE = 'intro-scene';
export const INTRO_LOGO_URL = '/intro/channel-banner.png';
export interface IntroPlayback { locked: boolean; elapsed: Record<string, number> }
export const INTRO_EDITING: IntroPlayback = { locked: false, elapsed: {} };
export function introDuration(step: AnimationStep) {
  return step.introEffect === 'electricity' ? INTRO_ELECTRIC_SECONDS : INTRO_REVEAL_SECONDS;
}
export function introPlaybackAt(steps: { step: AnimationStep; start: number }[], time: number): IntroPlayback {
  return { locked: true, elapsed: Object.fromEntries(steps.filter(event => event.step.introEffect).map(event => [event.step.id, time - event.start])) };
}

export function logoSheenStateAt(elapsed: number) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const sweep = clamp((elapsed - .04) / .64);
  const smooth = sweep * sweep * (3 - 2 * sweep);
  const envelope = clamp(elapsed / .07) * clamp((INTRO_ELECTRIC_SECONDS - elapsed) / .12);
  return {
    visible: elapsed >= 0 && elapsed < INTRO_ELECTRIC_SECONDS,
    center: 320 + smooth * 1140,
    opacity: envelope,
    ignition: Math.sin(clamp(elapsed / .16) * Math.PI) ** 2 * envelope,
    glint: Math.sin(clamp((elapsed - .62) / .28) * Math.PI) ** 2 * envelope,
  };
}
