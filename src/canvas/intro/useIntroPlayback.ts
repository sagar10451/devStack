import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AnimationStep } from '../types';
import { introDuration, type IntroPlayback } from './playback';

export function useIntroPlayback({ locked, steps, currentStep, audioPlaying, audioRef, getAudioStarts }: {
  locked: boolean; steps: AnimationStep[]; currentStep: number; audioPlaying: boolean;
  audioRef: RefObject<HTMLAudioElement | null>; getAudioStarts: () => Map<string, number>;
}): IntroPlayback {
  const [elapsed, setElapsed] = useState<Record<string, number>>({});
  const starts = useRef<Record<string, number>>({});
  const previous = useRef(-1);
  const sounded = useRef(new Set<string>());
  useEffect(() => {
    const effects = steps.flatMap((step, index) => step.introEffect ? [{ step, index }] : []);
    let frame: number | undefined;
    if (!locked) { starts.current = {}; sounded.current.clear(); previous.current = -1; setElapsed({}); return; }
    const audioTimes = audioPlaying ? getAudioStarts() : new Map<string, number>();
    if (!audioPlaying) {
      const before = previous.current;
      for (const { step, index } of effects) {
        if (index > currentStep || currentStep < before && index >= currentStep) delete starts.current[step.id];
        if (index <= currentStep && (index > before || currentStep < before && index === currentStep) && starts.current[step.id] === undefined) starts.current[step.id] = performance.now();
      }
      previous.current = currentStep;
      sounded.current.clear();
    }
    const tick = (now: number) => {
      const values: Record<string, number> = {};
      let active = audioPlaying;
      for (const { step, index } of effects) {
        const duration = introDuration(step);
        const audioStart = audioTimes.get(step.id);
        const time = audioPlaying && audioRef.current && audioStart !== undefined
          ? audioRef.current.currentTime - audioStart
          : starts.current[step.id] !== undefined ? Math.max(0, (now - starts.current[step.id]) / 1000) : index <= currentStep ? duration : -1;
        values[step.id] = Math.max(-1, Math.min(duration, time));
        if (time >= 0 && time < duration) active = true;
        if (time < 0) sounded.current.delete(step.id);
        else if (!sounded.current.has(step.id) && time < duration) {
          sounded.current.add(step.id);
          try {
            const audio = new Audio(step.introEffect === 'chapter' ? '/sounds/highlight_line.mp3' : '/sounds/intro-sheen.wav');
            audio.volume = step.introEffect === 'chapter' ? .2 : .16;
            audio.play().catch(() => {});
          } catch {}
        }
      }
      setElapsed(old => effects.every(({ step }) => old[step.id] === values[step.id]) ? old : values);
      if (active && effects.length) frame = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [locked, steps, currentStep, audioPlaying, audioRef, getAudioStarts]);
  return { locked, elapsed };
}
