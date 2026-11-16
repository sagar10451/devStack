import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Box } from 'tldraw';
import type { Editor, TLShapeId, TLPageId } from 'tldraw';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';
import CanvasEditor from '../CanvasEditor';
import FreehandSwipeMask from '../FreehandSwipeMask';
import { introPlaybackAt } from '../intro/playback';
import { SCENE, getSceneOutputCamera } from '../sceneLayout';
import { nodeTypes } from '../diagram/nodeTypes';
import { edgeTypes } from '../diagram/edgeTypes';
import { generateHandDrawnHighlightPath } from './highlightGeometry';
import { VIDEO, documentRecords, includedVideoRecords, shapeStateAt, videoStateAt } from './timeline';
import type { VideoTimeline } from './timeline';
import { createFramePlan, reuseUntilFrame } from './framePlan';
import '../diagram/diagramStyles.css';
import '@xyflow/react/dist/style.css';
import './video.css';

const noop = () => {};
const outputScale = VIDEO.width / SCENE.width;
const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
export interface VideoFrameResult { reuseUntilFrame: number }
export interface VideoSceneAPI { seekFrame: (frame: number) => Promise<VideoFrameResult> }

function seekAnimation(element: HTMLElement, className: string, elapsed: number, duration?: number) {
  element.classList.add(className);
  if (duration !== undefined) element.style.setProperty('--step-duration', `${Math.max(1, duration * 1000)}ms`);
  void element.offsetWidth;
  for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = Math.max(0, elapsed * 1000); }
}

export default function VideoScene({ timeline, onReady, onError }: {
  timeline: VideoTimeline; onReady: (api: VideoSceneAPI) => void; onError: (error: Error) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [time, setTime] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const laser = useRef<HTMLCanvasElement>(null);
  const original = useRef(new Map(documentRecords(timeline.lesson).map(record => [record.id, record])));
  const state = videoStateAt(timeline, time);
  const outputCamera = getSceneOutputCamera(state.camera);
  const lesson = timeline.lesson;
  const framePlan = useMemo(() => createFramePlan(timeline), [timeline]);
  const handleMount = useCallback((ed: Editor) => {
    ed.updateInstanceState({ isReadonly: true });
    ed.updateViewportScreenBounds(new Box(0, 0, VIDEO.width, VIDEO.height));
    setEditor(ed);
  }, []);

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const find = (id: string) => {
      const line = id.match(/^(.*):line:(\d+)$/);
      if (line) return root.current?.querySelector<HTMLElement>(`[data-shape-id="${CSS.escape(line[1])}"] [data-glow-line="${line[2]}"]`);
      return root.current?.querySelector<HTMLElement>(`[data-shape-id="${CSS.escape(id)}"], [data-id="${CSS.escape(id)}"]`);
    };
    const seekFrame = async (frame: number) => {
      if (!Number.isInteger(frame) || frame < 0 || frame >= timeline.frameCount) throw new Error('Video frame is out of range.');
      const nextTime = frame / VIDEO.fps;
      const next = videoStateAt(timeline, nextTime);
      editor.stopCameraAnimation();
      editor.setCurrentPage(next.pageId as TLPageId);
      await editor.fonts.loadRequiredFontsForCurrentPage();
      // Restore positions from the frozen snapshot on every seek. Seeking backwards
      // must be identical to reaching the same frame by playing forwards.
      editor.run(() => {
        for (const shape of editor.getCurrentPageShapes()) {
          const base = original.current.get(shape.id);
          if (!base) continue;
          const s = shapeStateAt(timeline, shape.id, nextTime);
          editor.updateShape({ id: shape.id, type: shape.type, x: s.position?.x ?? base.x, y: s.position?.y ?? base.y, opacity: base.opacity ?? 1 });
        }
      }, { ignoreShapeLock: true });
      editor.updateViewportScreenBounds(new Box(0, 0, VIDEO.width, VIDEO.height));
      editor.setCamera(getSceneOutputCamera(next.camera), { force: true });
      flushSync(() => setTime(nextTime));
      await settle();
      const stage = root.current;
      if (!stage) throw new Error('The video stage was unmounted.');
      // Pause every built-in CSS animation (including custom shapes / animated
      // diagram edges); specific step animations use time relative to their step.
      for (const animation of stage.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = nextTime * 1000; }
      for (const el of stage.querySelectorAll<HTMLElement>('[data-shape-id], [data-id], [data-glow-line]')) {
        for (const cls of [...el.classList]) if (cls.startsWith('step-anim-') || cls.startsWith('idle-')) el.classList.remove(cls);
        const parentId = el.closest('[data-shape-id]')?.getAttribute('data-shape-id');
        const line = el.getAttribute('data-glow-line');
        const id = line !== null ? `${parentId}:line:${line}` : el.getAttribute('data-shape-id') || el.getAttribute('data-id');
        if (!id) continue;
        const value = shapeStateAt(timeline, id, nextTime);
        const hideHelper = lesson.helperShapeIds?.includes(id) && !(lesson.canvasMode === 'rough' || lesson.roughMode);
        el.style.visibility = value.visible && !hideHelper ? 'visible' : 'hidden';
        for (const cls of [...el.classList]) if (cls.startsWith('glow-image-')) el.classList.remove(cls);
        if (value.visible && lesson.imageGlowColors?.[id] && lesson.imageGlowColors[id] !== 'none') seekAnimation(el, `glow-image-${lesson.imageGlowColors[id]}`, nextTime);
        if (value.visible && value.animation && value.animation !== 'none' && (value.elapsed < value.duration || value.animation.startsWith('idle'))) {
          seekAnimation(el, `step-anim-${value.animation}`, value.elapsed, value.duration);
          if (getComputedStyle(el).animationName === 'none') throw new Error(`Unsupported animation: ${value.animation}`);
        } else if (value.visible && lesson.shapeAnimations[id]?.idle && lesson.shapeAnimations[id].idle !== 'none') {
          seekAnimation(el, `idle-${lesson.shapeAnimations[id].idle}`, value.elapsed);
        }
        const box = el.querySelector<HTMLElement>('.glow-notes-box');
        if (box) {
          box.classList.remove('glow-flicker-in');
          if (value.visible && value.animation && value.elapsed < 1.2) seekAnimation(box, 'glow-flicker-in', value.elapsed);
        }
      }
      for (const el of stage.querySelectorAll<HTMLElement>('[data-topic-id]')) el.classList.remove('topic-roll-call-active');
      // A parent box can be visible before any of its independently revealed lines.
      for (const event of timeline.events) {
        for (const id of event.step.shapeIds.filter(id => id.includes(':line:'))) {
          const el = find(id);
          if (el) el.style.visibility = shapeStateAt(timeline, id, nextTime).visible ? 'visible' : 'hidden';
        }
        if (event.start <= nextTime && event.step.action?.startsWith('topic')) {
          const elapsed = nextTime - event.start;
          if (elapsed < 2.2) {
            for (const el of stage.querySelectorAll<HTMLElement>('[data-topic-id]')) {
              if (event.step.action === 'topicRollCall' || el.dataset.topicId === event.step.topicGlowTargetId) seekAnimation(el, 'topic-roll-call-active', elapsed);
            }
          }
        }
      }
      const active = stage.querySelector<HTMLElement>('[data-topic-status="active"]') || [...stage.querySelectorAll<HTMLElement>('[data-topic-status="complete"]')].at(-1);
      if (active?.parentElement) active.parentElement.scrollTop = Math.max(0, active.offsetTop - active.parentElement.offsetTop - active.parentElement.clientHeight / 2 + active.clientHeight / 2);
      // Freeze overlay CSS animations after applying React's current frame.
      for (const el of stage.querySelectorAll<HTMLElement>('[data-overlay-step]')) {
        const event = timeline.events.find(e => e.step.id === el.dataset.overlayStep);
        if (event) for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = Math.max(0, nextTime - event.start) * 1000; }
      }
      // Visibility alone becomes true at the first entrance frame, while the
      // image can still be fully transparent. Match the frozen image opacity
      // so the glass tint cannot appear before the pixels underneath it.
      for (const el of stage.querySelectorAll<HTMLElement>('[data-mask-image]')) {
        const image = find(el.dataset.maskImage!);
        const imageOpacity = image && getComputedStyle(image).visibility === 'visible'
          ? Number(getComputedStyle(image).opacity) : 0;
        el.style.opacity = String(imageOpacity * Number(el.dataset.maskOpacity ?? 1));
      }
      drawLaser(nextTime);
      await document.fonts.ready;
      await Promise.all([...stage.querySelectorAll('img')].filter(image => image.getBoundingClientRect().width > 0).map(async image => {
        if (image.currentSrc || image.src) await image.decode();
        if (!image.naturalWidth) throw new Error('An image failed to decode.');
      }));
      await settle();
      const cssActive = stage.getAnimations({ subtree: true }).some(animation => {
        const end = animation.effect?.getComputedTiming().endTime;
        const now = animation.currentTime;
        return typeof end !== 'number' || !Number.isFinite(end) || typeof now !== 'number' || now < end;
      });
      return { reuseUntilFrame: reuseUntilFrame(framePlan, frame, cssActive) };
    };
    const drawLaser = (now: number) => {
      const canvas = laser.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, VIDEO.width, VIDEO.height);
      const current = videoStateAt(timeline, now);
      const camera = getSceneOutputCamera(current.camera);
      const groups = timeline.events.filter(e => e.step.pageId === current.pageId && e.step.cameraPosition);
      const groupIndex = Math.max(0, groups.filter(e => e.start <= now).length - 1);
      for (const stroke of lesson.laserStrokes?.[current.pageId] || []) {
        if ((stroke.cameraGroupIdx ?? 0) !== groupIndex) continue;
        const id = (stroke as typeof stroke & { id?: string }).id;
        const elapsed = now - (id ? lesson.laserTimings?.[id] ?? Infinity : Infinity);
        if (elapsed < 0) continue;
        const hasTiming = (stroke.path.at(-1)?.t || 0) > 0;
        const points = stroke.path.filter((p, i) => (hasTiming ? p.t : i * 50) <= elapsed * 1000);
        if (!points.length) continue;
        ctx.beginPath(); ctx.strokeStyle = '#FF3030'; ctx.lineWidth = 3 * outputScale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#FF3030'; ctx.shadowBlur = 10 * outputScale;
        points.forEach((point, i) => { const x = (point.x + camera.x) * camera.z, y = (point.y + camera.y) * camera.z; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
      }
    };
    (async () => {
      // Decode assets on every page before the first frame, not just those
      // currently in the viewport. Font loading is also an explicit barrier.
      const used = new Set(includedVideoRecords(lesson).assets.map(asset => asset.id));
      for (const asset of editor.getAssets().filter(asset => used.has(asset.id))) {
        if (asset.type !== 'image') continue;
        if (!asset.props.src) throw new Error(`Missing image source: ${asset.id}`);
        const image = new Image(); image.src = asset.props.src; await image.decode();
      }
      await settle(); await document.fonts.ready;
      if (cancelled) return;
      await seekFrame(0);
      if (!cancelled) onReady({ seekFrame });
    })().catch(error => { if (!cancelled) onError(error); });
    return () => { cancelled = true; };
  }, [editor, framePlan, lesson, onError, onReady, timeline]);

  const regions = (lesson.highlightRegions || []).filter(r => r.pageId === state.pageId);
  return <div ref={root} className={`video-stage scene-composition ${lesson.bwMode ? 'bw-theme' : ''}`} data-testid="video-stage">
    <div className="video-canvas canvas-locked">
      <CanvasEditor snapshot={lesson.snapshot} onEditorReady={handleMount} onDocumentChange={noop} onLoadError={onError} introPlayback={introPlaybackAt(timeline.events, time)} hideUi />
      {!!lesson.diagramData?.nodes.length && <div className="video-diagram rf-locked">
        <ReactFlowProvider><ReactFlow nodes={lesson.diagramData.nodes as Node[]} edges={lesson.diagramData.edges as Edge[]}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes} viewport={{ x: outputCamera.x * outputCamera.z, y: outputCamera.y * outputCamera.z, zoom: outputCamera.z }}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }} /></ReactFlowProvider>
      </div>}
      {editor && regions.map(region => {
        const bounds = editor.getShapePageBounds(region.imageShapeId as TLShapeId);
        if (!bounds) return null;
        const event = timeline.events.find(e => e.step.id === region.stepId);
        const elapsed = event ? time - event.start : -1;
        const mask = region.type === 'mask';
        if (!mask && elapsed < 0) return null;
        const freehand = !!region.path && region.path.length > 2;
        const cam = outputCamera;
        const x = freehand ? bounds.x : bounds.x + region.x * bounds.w;
        const y = freehand ? bounds.y : bounds.y + region.y * bounds.h;
        const w = (freehand ? bounds.w : region.w * bounds.w) * cam.z;
        const h = (freehand ? bounds.h : region.h * bounds.h) * cam.z;
        const clipPath = freehand ? `polygon(${region.path!.map(p => `${p.x * 100}% ${p.y * 100}%`).join(',')})` : undefined;
        if (mask && elapsed > 2) return null;
        const style = { left: (x + cam.x) * cam.z, top: (y + cam.y) * cam.z, width: w, height: h };
        if (!mask && region.shape === 'cloud') return <svg key={region.id} data-overlay-step={region.stepId} viewBox="0 0 200 50" preserveAspectRatio="none" className="video-region video-highlight-reveal" style={{ ...style, left: style.left - w * .03, top: style.top - h * .15, width: w * 1.06, height: h * 1.3, mixBlendMode: 'multiply' }}><path d={generateHandDrawnHighlightPath(region.id)} fill={region.color} opacity=".82" /></svg>;
        if (mask && freehand && region.revealType === 'swipe') {
          if (!shapeStateAt(timeline, region.imageShapeId, time).visible) return null;
          return <FreehandSwipeMask key={region.id} path={region.path!} elapsed={elapsed} stepId={region.stepId} imageShapeId={region.imageShapeId} frostScale={outputScale} {...style} />;
        }
        return <div key={region.id}>
          <div data-overlay-step={region.stepId} className={`video-region ${!mask ? 'video-highlight-reveal' : elapsed >= 0 ? freehand ? 'mask-fade-reveal' : 'mask-radial-reveal' : ''}`}
            style={{ ...style, clipPath, borderRadius: freehand ? 0 : 6 * outputScale, background: mask ? 'transparent' : region.color, backdropFilter: mask ? 'grayscale(1)' : undefined, mixBlendMode: mask ? undefined : 'multiply' }} />
          {mask && elapsed >= 0 && elapsed <= 1 && <div data-overlay-step={region.stepId} className="video-region mask-reveal-flash" style={{ ...style, clipPath, background: 'white', borderRadius: freehand ? 0 : 6 * outputScale }} />}
        </div>;
      })}
      {(lesson.pointerArrows || []).filter(arrow => arrow.pageId === state.pageId).map(arrow => {
        const event = timeline.events.find(e => e.step.id === arrow.stepId);
        if (!event || time < event.start) return null;
        const elapsed = time - event.start;
        const active = state.currentStep === event.index;
        if (!active && (!arrow.keepVisible || arrow.keepDuration > 0 && elapsed > arrow.keepDuration)) return null;
        return <div key={arrow.id} data-overlay-step={arrow.stepId} className="video-pointer" style={{ left: (arrow.x + outputCamera.x) * outputCamera.z, top: (arrow.y + outputCamera.y) * outputCamera.z, transform: `scale(${outputScale})`, transformOrigin: 'top left' }}>
          <div className={active ? 'pointer-arrow-bounce' : ''} style={{ '--arrow-rotation': `${arrow.rotation}deg`, transform: `rotate(${arrow.rotation}deg)` } as CSSProperties}><svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 2 L28 18 L23 18 L23 38 L17 38 L17 18 L12 18 Z" fill="#FF3B30" stroke="white" strokeWidth="1.5" /></svg></div>
        </div>;
      })}
      <canvas ref={laser} width={VIDEO.width} height={VIDEO.height} className="video-laser" />
    </div>
  </div>;
}
