import type { AnimationStep, LessonCanvasData } from '../types.ts';
import { computeTimedEntries } from '../audioTimingUtils.ts';
import { SWIPE_GLOW_SECONDS } from '../swipeReveal.ts';
import { introDuration } from '../intro/playback.ts';
type SceneCamera = { x: number; y: number; z: number };

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;
export interface SnapshotRecord {
  id: string; typeName: string; type?: string; index?: string; parentId?: string;
  x?: number; y?: number; rotation?: number; opacity?: number;
  props?: Record<string, unknown>;
}
export function documentRecords(lesson: LessonCanvasData): SnapshotRecord[] {
  const snapshot = lesson.snapshot as { document?: { store?: Record<string, SnapshotRecord> } };
  if (!snapshot?.document?.store) throw new Error('The lesson has no valid saved canvas snapshot.');
  return Object.values(snapshot.document.store);
}
export function includedVideoRecords(lesson: LessonCanvasData) {
  const records = documentRecords(lesson);
  const byId = new Map(records.map(record => [record.id, record]));
  const excluded = new Set(lesson.excludedPages || []);
  const shapes = records.filter(record => {
    if (record.typeName !== 'shape') return false;
    let parent = record.parentId;
    const seen = new Set<string>();
    while (parent && byId.get(parent)?.typeName !== 'page') {
      if (seen.has(parent)) throw new Error('The canvas contains a circular group.');
      seen.add(parent); parent = byId.get(parent)?.parentId;
    }
    return !!parent && !excluded.has(parent);
  });
  const assetIds = new Set(shapes.map(shape => shape.props?.assetId));
  return { shapes, assets: records.filter(record => record.typeName === 'asset' && assetIds.has(record.id)) };
}
export interface TimedStep { step: AnimationStep; start: number; index: number }
export interface VideoTimeline {
  lesson: LessonCanvasData; pages: string[]; steps: AnimationStep[]; events: TimedStep[];
  duration: number; frameCount: number;
}
export interface VideoOptions {
  tailSeconds: number;
  narration: boolean;
  background: { enabled: boolean; volume: number; loop: boolean };
}
export interface VideoPayload {
  lesson: LessonCanvasData; siteId: string; options: VideoOptions;
}
const overlayLabels = new Set(['Highlight', 'Mask', 'Paint B&W', 'Pointer']);
export const isOverlayStep = (step: AnimationStep) => overlayLabels.has(step.label);

export function compileVideoTimeline(lesson: LessonCanvasData, audioDuration = 0, tailSeconds = 1): VideoTimeline {
  if (!lesson.sceneLayout) throw new Error('Enable 16:9 Scene before exporting.');
  const records = documentRecords(lesson);
  const excluded = new Set(lesson.excludedPages || []);
  const allPages = records.filter(r => r.typeName === 'page')
    .sort((a, b) => (a.index || '') < (b.index || '') ? -1 : (a.index || '') > (b.index || '') ? 1 : 0).map(r => r.id);
  const pages = allPages.filter(id => !excluded.has(id));
  if (!pages.length) throw new Error('There are no included pages to export.');
  const steps = pages.flatMap(pageId => lesson.animationSteps.filter(s => (s.pageId || allPages[0]) === pageId).map(s => s.pageId ? s : { ...s, pageId: allPages[0] }));
  const timings = lesson.globalAudioDurations || {};
  for (const [key, value] of Object.entries(timings)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid timeline duration: ${key}`);
  }
  const entries = computeTimedEntries({
    steps, pageIds: pages, durations: timings,
    pageTopicVisible: new Set((lesson.pageTopicVisible || []).filter(p => pages.includes(p))),
    pageSubtitleVisible: new Set((lesson.pageSubtitleVisible || []).filter(p => pages.includes(p))),
    pageTopicModes: lesson.pageTopicModes || {}, pageSubtitleModes: lesson.pageSubtitleModes || {},
  });
  const starts = new Map(entries.map(entry => [entry.id, entry.start]));
  let groupStart = 0;
  const rough = lesson.canvasMode === 'rough' || lesson.roughMode;
  const events = steps.map((step, index) => {
    if (!Number.isFinite(step.duration) || step.duration < 0) throw new Error(`Invalid animation duration: ${step.label}`);
    if (step.cameraPosition && (![step.cameraPosition.x, step.cameraPosition.y, step.cameraPosition.z].every(Number.isFinite) || step.cameraPosition.z <= 0)) throw new Error(`Invalid saved camera: ${step.label}`);
    if (rough && step.cameraPosition) {
      if (step.audioStartTime === undefined || !Number.isFinite(step.audioStartTime) || step.audioStartTime < groupStart) {
        throw new Error(`Set ordered audio start times on every camera group (step ${index + 1}).`);
      }
      groupStart = step.audioStartTime;
    }
    return { step, index, start: rough ? groupStart : starts.get(step.id) ?? 0 };
  });
  let end = Math.max(0, audioDuration, ...entries.map(e => rough ? 0 : e.start + e.duration));
  for (const event of events) {
    end = Math.max(end, event.start + event.step.duration / 1000);
    if (event.step.introEffect) end = Math.max(end, event.start + introDuration(event.step));
    if (event.step.audio && !event.step.audio.loop) end = Math.max(end, event.start + event.step.audio.endTime - event.step.audio.startTime);
  }
  for (const region of lesson.highlightRegions || []) {
    if (region.type !== 'mask' || region.revealType !== 'swipe' || (region.path?.length || 0) < 3 || !pages.includes(region.pageId)) continue;
    const event = events.find(event => event.step.id === region.stepId);
    if (event) end = Math.max(end, event.start + SWIPE_GLOW_SECONDS);
  }
  for (const [pageId, strokes] of Object.entries(lesson.laserStrokes || {})) {
    if (!pages.includes(pageId)) continue;
    for (const stroke of strokes) {
      if (!Array.isArray(stroke.path) || !stroke.path.length) throw new Error('A laser stroke has no recorded points.');
      let previous = -1;
      for (const point of stroke.path) {
        if (![point.x, point.y].every(Number.isFinite) || point.t !== undefined && (!Number.isFinite(point.t) || point.t < previous)) throw new Error('A laser stroke has invalid positions or timestamps.');
        if (point.t !== undefined) previous = point.t;
      }
      const id = (stroke as typeof stroke & { id?: string }).id;
      if (!id || !Number.isFinite(lesson.laserTimings?.[id]) || lesson.laserTimings![id] < 0) throw new Error('Every laser stroke needs a saved Laser Sync start time.');
      const last = stroke.path.at(-1)?.t || Math.max(0, stroke.path.length - 1) * 50;
      end = Math.max(end, lesson.laserTimings![id] + last / 1000);
    }
  }
  if (!Number.isFinite(tailSeconds) || tailSeconds < 0 || tailSeconds > 30) throw new Error('Final hold must be between 0 and 30 seconds.');
  const duration = Math.max(1 / VIDEO.fps, end + tailSeconds);
  const frameCount = Math.ceil(duration * VIDEO.fps - 1e-8);
  return { lesson, pages, steps, events, duration: frameCount / VIDEO.fps, frameCount };
}

function defaultCamera(timeline: VideoTimeline, pageId: string): SceneCamera {
  // Playback starts at guide 1; an editing selection never chooses export order.
  const origin = (timeline.lesson.guideBordersMap?.[pageId] || timeline.lesson.guideBordersMap?._default)?.[0] || { x: 0, y: 0 };
  return { x: -origin.x, y: -origin.y, z: 1 };
}
export function videoStateAt(timeline: VideoTimeline, time: number) {
  if (!Number.isFinite(time) || time < 0) throw new Error('Invalid video time.');
  let pageId = timeline.pages[0];
  let currentStep = -1;
  let camera = defaultCamera(timeline, pageId);
  let transition: { from: SceneCamera; to: SceneCamera; start: number } | undefined;
  const sample = (at: number) => {
    if (!transition) return camera;
    const t = Math.max(0, Math.min(1, (at - transition.start) / 0.8));
    const eased = 1 - Math.pow(1 - t, 3);
    return { x: transition.from.x + (transition.to.x - transition.from.x) * eased, y: transition.from.y + (transition.to.y - transition.from.y) * eased, z: transition.from.z + (transition.to.z - transition.from.z) * eased };
  };
  for (const event of timeline.events) {
    if (event.start > time) break;
    currentStep = event.index;
    const nextPage = event.step.pageId || timeline.pages[0];
    const pageChanged = nextPage !== pageId;
    camera = sample(event.start);
    if (pageChanged) { pageId = nextPage; camera = defaultCamera(timeline, pageId); transition = undefined; }
    const target = event.step.cameraPosition;
    if (!target) continue;
    if (![target.x, target.y, target.z].every(Number.isFinite) || target.z <= 0) throw new Error('Invalid saved camera.');
    if (pageChanged || event.index === 0) { camera = { ...target }; transition = undefined; }
    else transition = { from: { ...camera }, to: target, start: event.start };
  }
  camera = sample(time);
  return { pageId, currentStep, camera };
}

export interface ShapeVideoState { visible: boolean; animation?: string; elapsed: number; duration: number; position?: { x: number; y: number } }
type ShapeHistory = { events: TimedStep[]; preloaded?: TimedStep };
const shapeHistories = new WeakMap<VideoTimeline, Map<string, ShapeHistory>>();
function shapeHistory(timeline: VideoTimeline, id: string): ShapeHistory {
  let histories = shapeHistories.get(timeline);
  if (!histories) {
    histories = new Map();
    for (const event of timeline.events) {
      if (isOverlayStep(event.step) || event.step.action === 'none') continue;
      for (const target of new Set([...event.step.shapeIds, ...(event.step.exitShapeIds || [])])) {
        const history = histories.get(target) || { events: [] };
        history.events.push(event);
        if (!history.preloaded && event.step.animation === 'none' && (event.step.action || 'enter') === 'enter' && event.step.shapeIds.includes(target)) history.preloaded = event;
        histories.set(target, history);
      }
    }
    shapeHistories.set(timeline, histories);
  }
  return histories.get(id) || { events: [] };
}
export function shapeStateAt(timeline: VideoTimeline, id: string, time: number): ShapeVideoState {
  const { events, preloaded } = shapeHistory(timeline, id);
  let state: ShapeVideoState = { visible: events.length === 0, elapsed: 0, duration: 0 };
  if (preloaded) state.visible = true;
  for (const event of events) {
    if (event.start > time) break;
    const step = event.step;
    const action = step.action || 'enter';
    if (action === 'none' || action.startsWith('topic') || action === 'logoGlow') continue;
    if (action === 'exit' || step.exitShapeIds?.includes(id)) { state.visible = false; continue; }
    const elapsed = time - event.start;
    const configured = timeline.lesson.globalAudioDurations?.[step.id];
    const duration = Math.min(step.duration / 1000, configured === undefined ? Infinity : configured);
    if (action === 'blink') {
      if (elapsed < duration) state = { ...state, animation: 'blink', elapsed, duration };
      continue;
    }
    if (action === 'move' || action === 'teleport') {
      const half = action === 'teleport' ? duration / 2 : 0;
      state = { visible: elapsed >= half, elapsed: Math.max(0, elapsed - half), duration: action === 'teleport' ? half : duration, animation: 'fadeIn', position: step.targetPosition };
    } else {
      state = { ...state, visible: true, animation: preloaded?.step.id === step.id ? undefined : step.animation, elapsed, duration };
    }
  }
  return state;
}

// Fail explicitly for features that don't yet have a faithful frame-based implementation.
export function videoPreflight(lesson: LessonCanvasData): string[] {
  const errors: string[] = [];
  let records: SnapshotRecord[], timeline: VideoTimeline;
  try {
    const included = includedVideoRecords(lesson);
    records = [...included.shapes, ...included.assets]; timeline = compileVideoTimeline(lesson);
  } catch (error) { return [(error as Error).message]; }
  const supported = new Set(['image', 'text', 'geo', 'arrow', 'line', 'draw', 'highlight', 'group', 'frame', 'note', 'code-block', 'md-block', 'glow-notes', 'sticky-note', 'chapter-name', 'intro-scene']);
  for (const r of records) {
    if (r.typeName === 'shape' && !supported.has(r.type || '')) errors.push(`Unsupported shape: ${r.type} (${r.id}).`);
    if (r.typeName === 'asset' && (r.type === 'video' || r.props?.isAnimated || r.props?.mimeType === 'image/gif')) errors.push('Animated images and embedded videos are not supported in this export version.');
  }
  const validIds = new Set([...records.map(record => record.id), ...(lesson.diagramData?.nodes || []).map(node => (node as { id: string }).id), ...(lesson.diagramData?.edges || []).map(edge => (edge as { id: string }).id)]);
  const recordById = new Map(records.map(record => [record.id, record]));
  const actions = new Set(['enter', 'exit', 'blink', 'move', 'teleport', 'swap', 'none', 'topicRollCall', 'topicGlowOne', 'logoGlow']);
  const animations = new Set('none appear fadeIn fadeOut flyInLeft flyInRight flyInTop flyInBottom zoomIn zoomOut pop pulse bounce typewriter drawLine slideInLeft slideInRight slideInTop slideInBottom idleFloat idleShake idlePulse idleBounce idleBreathe idleWiggle idleSway revealLeft revealRight revealTop revealBottom revealCenter'.split(' '));
  for (const pageId of timeline.pages) {
    const count = lesson.guideCountMap?.[pageId] ?? lesson.guideCountMap?._default ?? lesson.guideCount ?? 1;
    if (count > 1 && !timeline.events.some(event => event.step.pageId === pageId && event.step.cameraPosition)) errors.push('Pages with multiple guides need saved timeline camera positions. Use Lock on their timeline steps.');
  }
  for (const step of timeline.steps) {
    if (step.action && !actions.has(step.action)) errors.push(`Unsupported action: ${step.action}.`);
    if (!animations.has(step.animation)) errors.push(`Unsupported animation: ${step.animation}.`);
    for (const id of [...step.shapeIds, ...(step.exitShapeIds || [])]) {
      if (!validIds.has(id.replace(/:line:\d+$/, ''))) errors.push(`Missing timeline element: ${id}.`);
      if (recordById.get(id)?.type === 'group') errors.push('Ungroup animated groups before exporting this version. Static groups are supported.');
    }
    if (step.pinAsTitle || step.pinAsSubtitle) errors.push('Pinned title/subtitle overlays need export support before this lesson can be exported.');
    if (step.action === 'logoGlow') errors.push('Logo Glow targets the app header, which is outside the video stage. Remove that step before export.');
    if ((step.action === 'move' || step.action === 'teleport') && !step.targetPosition) errors.push(`Missing destination for ${step.label}.`);
    if (step.audio && !step.audio.data) errors.push(`Reattach audio clip: ${step.audio.fileName}.`);
  }
  const eventIds = new Set(timeline.steps.map(step => step.id));
  for (const region of lesson.highlightRegions || []) {
    if (!timeline.pages.includes(region.pageId)) continue;
    if (!eventIds.has(region.stepId) || !validIds.has(region.imageShapeId)) errors.push('A highlight/mask is missing its image or timeline step.');
    if (![region.x, region.y, region.w, region.h].every(Number.isFinite) || region.w <= 0 || region.h <= 0) errors.push('A highlight/mask has invalid dimensions.');
    if (region.path?.some(point => ![point.x, point.y].every(Number.isFinite))) errors.push('A freehand mask has invalid path points.');
  }
  for (const arrow of lesson.pointerArrows || []) {
    if (timeline.pages.includes(arrow.pageId) && (!eventIds.has(arrow.stepId) || ![arrow.x, arrow.y, arrow.rotation, arrow.keepDuration].every(Number.isFinite))) errors.push('A pointer arrow has invalid timing or geometry.');
  }
  if (lesson.canvasSplitEnabled) errors.push('The Audio Notes splitter is not yet supported for video export.');
  return [...new Set(errors)];
}
