import { VIDEO, documentRecords, videoStateAt } from './timeline.ts';
import type { VideoTimeline } from './timeline.ts';
import { SWIPE_SECONDS, SWIPE_GLOW_SECONDS } from '../swipeReveal.ts';
import { introDuration } from '../intro/playback.ts';

export interface FramePlan {
  boundaries: number[];
  dynamicWindows: { start: number; end: number }[];
  frameCount: number;
  uncontrolledImageAnimation: boolean;
}

// These are conservative boundaries, not a list of keyframes to drop. Every
// output frame is still encoded. Reuse is allowed only when both this plan and
// the browser's actual CSS animation state say the picture cannot change.
export function createFramePlan(timeline: VideoTimeline): FramePlan {
  const boundaries = new Set([0, timeline.frameCount]);
  const windows: { start: number; end: number }[] = [];
  const at = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    // Include both sides of a boundary, including strict `elapsed > duration`
    // conditions and fractional timestamps between output frames.
    const floor = Math.floor(seconds * VIDEO.fps + 1e-8);
    const ceil = Math.ceil(seconds * VIDEO.fps - 1e-8);
    for (const frame of [floor, ceil, ceil + 1]) if (frame >= 0 && frame <= timeline.frameCount) boundaries.add(frame);
  };
  const moving = (start: number, end: number) => {
    at(start); at(end);
    windows.push({ start: Math.max(0, Math.floor(start * VIDEO.fps)), end: Math.ceil(end * VIDEO.fps) + 1 });
  };
  const events = new Map(timeline.events.map(event => [event.step.id, event]));
  const records = new Map(documentRecords(timeline.lesson).map(record => [record.id, record]));
  // SVG animations inside an <img> are not exposed by stage.getAnimations().
  // Leave these on the full frame path instead of assuming a still image.
  const uncontrolledImageAnimation = [...records.values()].some(record => {
    if (record.typeName !== 'asset' || record.type !== 'image') return false;
    const src = String(record.props?.src || '');
    if (record.props?.mimeType !== 'image/svg+xml' && !src.startsWith('data:image/svg+xml')) return false;
    const match = /^data:image\/svg\+xml([^,]*),(.*)$/s.exec(src);
    if (!match) return true;
    try {
      const svg = match[1].includes(';base64') ? atob(match[2]) : decodeURIComponent(match[2]);
      return /<(?:animate\w*|set|script|foreignObject|image|link)\b|@(?:keyframes|import)|\b(?:animation|transition)[\w-]*\s*:/i.test(svg);
    } catch { return true; }
  });
  for (const event of timeline.events) {
    at(event.start);
    if (event.step.introEffect) moving(event.start, event.start + introDuration(event.step));
    const duration = Math.min(event.step.duration / 1000, timeline.lesson.globalAudioDurations?.[event.step.id] ?? Infinity);
    if (event.step.animation !== 'none' || ['move', 'teleport', 'blink'].includes(event.step.action || '')) at(event.start + duration);
    if (event.step.action === 'teleport') at(event.start + duration / 2);
    if (event.step.action?.startsWith('topic')) at(event.start + 2.2);
    if (event.step.shapeIds.some(id => records.get(id)?.type === 'glow-notes')) at(event.start + 1.2);
    const target = event.step.cameraPosition;
    if (target) {
      const current = videoStateAt(timeline, event.start).camera;
      if (current.x !== target.x || current.y !== target.y || current.z !== target.z) moving(event.start, event.start + .8);
    }
  }
  for (const region of timeline.lesson.highlightRegions || []) {
    const event = events.get(region.stepId);
    if (!event || !timeline.pages.includes(region.pageId)) continue;
    if (region.type === 'mask') {
      at(event.start + .8); at(event.start + 1); at(event.start + 2);
      if (region.path?.length && region.revealType === 'swipe') {
        at(event.start + SWIPE_SECONDS);
        moving(event.start, event.start + SWIPE_GLOW_SECONDS);
      }
    } else {
      // Playback highlights wipe for .5s and glow for 1s, independently of
      // the step's (often only 100ms) configured duration.
      at(event.start + .5);
      moving(event.start, event.start + 1);
    }
  }
  for (const arrow of timeline.lesson.pointerArrows || []) {
    const event = events.get(arrow.stepId);
    if (!event) continue;
    at(event.start + 1.6);
    if (arrow.keepDuration > 0) at(event.start + arrow.keepDuration);
  }
  for (const [page, strokes] of Object.entries(timeline.lesson.laserStrokes || {})) {
    if (!timeline.pages.includes(page)) continue;
    for (const stroke of strokes) {
      const id = (stroke as typeof stroke & { id?: string }).id;
      const start = id ? timeline.lesson.laserTimings?.[id] : undefined;
      if (start === undefined) continue;
      const duration = (stroke.path.at(-1)?.t || Math.max(0, stroke.path.length - 1) * 50) / 1000;
      moving(start, start + duration);
    }
  }
  windows.sort((a, b) => a.start - b.start);
  const merged: FramePlan['dynamicWindows'] = [];
  for (const window of windows) {
    const previous = merged.at(-1);
    if (previous && previous.end >= window.start) previous.end = Math.max(previous.end, window.end);
    else merged.push({ ...window });
  }
  return { boundaries: [...boundaries].sort((a, b) => a - b), dynamicWindows: merged, frameCount: timeline.frameCount, uncontrolledImageAnimation };
}

export function reuseUntilFrame(plan: FramePlan, frame: number, cssAnimationActive: boolean): number {
  if (cssAnimationActive || plan.uncontrolledImageAnimation || plan.dynamicWindows.some(window => frame >= window.start && frame < window.end)) return frame + 1;
  let lo = 0, hi = plan.boundaries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (plan.boundaries[mid] <= frame) lo = mid + 1;
    else hi = mid;
  }
  return plan.boundaries[lo] ?? plan.frameCount;
}
