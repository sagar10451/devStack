import type { AnimationStep } from './types';

export const AUTO_GAP = 0.5;
export const DEFAULT_DURATION = 3;

export interface GoNextTimesParams {
  steps: AnimationStep[];
  pageIds: string[];
  durations: Record<string, number>;
  pageTopicVisible: Set<string>;
  pageSubtitleVisible: Set<string>;
  pageTopicModes: Record<string, string>;
  pageSubtitleModes: Record<string, string>;
}

/**
 * Computes the goNextTimes array — the audio timestamps at which each step should fire.
 * Used by both GlobalAudioTimeline (UI display) and LessonCanvas (playback engine).
 * Single source of truth for timing.
 */
export function computeGoNextTimes(params: GoNextTimesParams): number[] {
  const { steps, pageIds, durations, pageTopicVisible, pageSubtitleVisible, pageTopicModes, pageSubtitleModes } = params;

  // Group steps by page
  const stepsByPage = new Map<string, AnimationStep[]>();
  for (const step of steps) {
    const pid = step.pageId || 'page:page';
    if (!stepsByPage.has(pid)) stepsByPage.set(pid, []);
    stepsByPage.get(pid)!.push(step);
  }

  // Build unified step ID list (same order as GlobalAudioTimeline's unifiedSteps)
  const unifiedIds: string[] = [];
  const unifiedIsPreloaded: boolean[] = [];

  for (let pi = 0; pi < pageIds.length; pi++) {
    const pid = pageIds[pi];

    // Topic (page 1 only)
    if (pi === 0 && pageTopicVisible.has(pid)) {
      const topicMode = pageTopicModes[pid] || 'preload';
      unifiedIds.push(`__topic__${pid}`);
      unifiedIsPreloaded.push(topicMode === 'preload');
    }

    // Subtitle (every page)
    if (pageSubtitleVisible.has(pid)) {
      const subMode = pageSubtitleModes[pid] || 'preload';
      unifiedIds.push(`__subtitle__${pid}`);
      unifiedIsPreloaded.push(subMode === 'preload');
    }

    // Element steps
    const pageSteps = stepsByPage.get(pid) || [];
    for (const step of pageSteps) {
      unifiedIds.push(step.id);
      const isPreloaded = step.animation === 'none' && (step.action || 'enter') === 'enter';
      unifiedIsPreloaded.push(isPreloaded);
    }
  }

  // Compute times — same logic as GlobalAudioTimeline's startTimesMap
  const goNextTimes: number[] = [];
  let cum = 0;

  for (let i = 0; i < unifiedIds.length; i++) {
    const id = unifiedIds[i];

    if (i === 0) {
      cum = durations[`__start_${id}`] ?? 0;
    }

    const isMerged = i > 0 && durations[`__merge_${id}`] === 1;

    if (isMerged) {
      // Merged: same time as previous
      goNextTimes.push(goNextTimes.length > 0 ? goNextTimes[goNextTimes.length - 1] : cum);
    } else {
      goNextTimes.push(cum);
    }

    if (!isMerged) {
      const defaultDur = unifiedIsPreloaded[i] ? 0 : DEFAULT_DURATION;
      const dur = durations[id] ?? defaultDur;
      cum += dur + (dur > 0 ? AUTO_GAP : 0);
    }
  }

  return goNextTimes;
}
