/**
 * TimelineBar — horizontal bottom bar showing animation steps as a page-grouped timeline.
 * Each step is a card showing shape info, action type, and camera lock button.
 * Shapes auto-added when created on canvas, grouped by tldraw page.
 * Cards are reordered via Move menu (no drag).
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  Trash2, Camera, CameraOff, ChevronDown, ChevronUp, Plus, Eye, Volume2, VolumeX,
  Type, Square, ArrowRight, Image, Pencil, Circle, Triangle, Star, Minus,
  GitBranch, Cable, MoveHorizontal,
} from 'lucide-react';
import type { AnimationStep, AnimationType, StepAction } from './types';
import type { Editor } from 'tldraw';
import type { DiagramData } from './diagram/diagramTypes';
import { getIconComponent } from './diagram/iconRegistry';

interface TimelineBarProps {
  steps: AnimationStep[];
  onStepsChange: (steps: AnimationStep[]) => void;
  editor: Editor | null;
  isLocked: boolean;
  diagramData?: DiagramData;
  selectedShapeIds?: string[];
}

const ANIMATION_OPTIONS: { value: string; label: string; group: string }[] = [
  // Entrance
  { value: 'appear', label: 'Appear', group: 'Entrance' },
  { value: 'flyInLeft', label: 'Fly Left', group: 'Entrance' },
  { value: 'flyInRight', label: 'Fly Right', group: 'Entrance' },
  { value: 'flyInTop', label: 'Fly Top', group: 'Entrance' },
  { value: 'flyInBottom', label: 'Fly Bottom', group: 'Entrance' },
  { value: 'pop', label: 'Pop', group: 'Entrance' },
  { value: 'pulse', label: 'Pulse', group: 'Entrance' },
  { value: 'bounce', label: 'Bounce', group: 'Entrance' },
  // Reveal
  { value: 'revealLeft', label: 'Reveal L→R', group: 'Reveal' },
  { value: 'revealRight', label: 'Reveal R→L', group: 'Reveal' },
  { value: 'revealTop', label: 'Reveal T→D', group: 'Reveal' },
  { value: 'revealBottom', label: 'Reveal B→U', group: 'Reveal' },
  { value: 'revealCenter', label: 'Reveal Center', group: 'Reveal' },
  // Special
  { value: 'blink', label: 'Blink', group: 'Special' },
  // Loop
  { value: 'idleFloat', label: 'Float (loop)', group: 'Loop' },
  { value: 'idleShake', label: 'Shake (loop)', group: 'Loop' },
  { value: 'idlePulse', label: 'Pulse (loop)', group: 'Loop' },
  { value: 'idleBounce', label: 'Bounce (loop)', group: 'Loop' },
  { value: 'idleBreathe', label: 'Breathe (loop)', group: 'Loop' },
  { value: 'idleWiggle', label: 'Wiggle (loop)', group: 'Loop' },
  { value: 'idleSway', label: 'Sway (loop)', group: 'Loop' },
];

const MANUAL_ACTION_OPTIONS: { value: StepAction; label: string }[] = [
  { value: 'exit', label: 'Erase' },
  { value: 'move', label: 'Move' },
  { value: 'teleport', label: 'Teleport' },
  { value: 'swap', label: 'Swap' },
];

// ─── Page color palette for visual separators ────────────────────────────────
const PAGE_COLORS = [
  { border: 'border-blue-500/40', bg: 'bg-blue-500/8', text: 'text-blue-400', label: 'bg-blue-500/20' },
  { border: 'border-emerald-500/40', bg: 'bg-emerald-500/8', text: 'text-emerald-400', label: 'bg-emerald-500/20' },
  { border: 'border-purple-500/40', bg: 'bg-purple-500/8', text: 'text-purple-400', label: 'bg-purple-500/20' },
  { border: 'border-amber-500/40', bg: 'bg-amber-500/8', text: 'text-amber-400', label: 'bg-amber-500/20' },
  { border: 'border-rose-500/40', bg: 'bg-rose-500/8', text: 'text-rose-400', label: 'bg-rose-500/20' },
  { border: 'border-cyan-500/40', bg: 'bg-cyan-500/8', text: 'text-cyan-400', label: 'bg-cyan-500/20' },
  { border: 'border-orange-500/40', bg: 'bg-orange-500/8', text: 'text-orange-400', label: 'bg-orange-500/20' },
  { border: 'border-indigo-500/40', bg: 'bg-indigo-500/8', text: 'text-indigo-400', label: 'bg-indigo-500/20' },
];

function getShapeIcon(editor: Editor | null, shapeId: string, diagramData?: DiagramData): { icon: React.ReactNode; label: string } {
  const cls = "w-3.5 h-3.5";

  if (!shapeId.includes(':')) {
    const node = diagramData?.nodes.find((n: any) => n.id === shapeId) as any;
    if (node) {
      const label = node?.data?.label || 'Node';
      const iconId = node?.data?.icon as string | undefined;
      if (iconId) {
        const IconComp = getIconComponent(iconId);
        if (IconComp) return { icon: <IconComp width={14} height={14} />, label };
      }
      return { icon: <GitBranch className={cls} />, label };
    }
    const edge = diagramData?.edges.find((e: any) => e.id === shapeId);
    if (edge) return { icon: <Cable className={cls} />, label: 'Edge' };
    return { icon: <GitBranch className={cls} />, label: 'Element' };
  }

  if (!editor) return { icon: <Square className={cls} />, label: 'Unknown' };
  const shape = editor.getShape(shapeId as any);
  if (!shape) return { icon: <Square className={cls} />, label: 'Deleted' };
  switch (shape.type) {
    case 'text': {
      let text = '';
      try {
        const props = shape.props as any;
        const content = props.richText?.content;
        if (Array.isArray(content)) {
          for (const nd of content) {
            if (nd.content && Array.isArray(nd.content)) {
              for (const inline of nd.content) {
                if (inline.text) text += inline.text + ' ';
              }
            }
          }
        }
      } catch { text = 'Text'; }
      return { icon: <Type className={cls} />, label: text.trim().split(/\s+/).slice(0, 3).join(' ') || 'Text' };
    }
    case 'geo': {
      const props = shape.props as any;
      let labelText = '';
      try {
        const content = props.richText?.content;
        if (Array.isArray(content)) {
          for (const nd of content) {
            if (nd.content && Array.isArray(nd.content)) {
              for (const inline of nd.content) {
                if (inline.text) labelText += inline.text + ' ';
              }
            }
          }
        }
      } catch { /* */ }
      const geo = props.geo || 'rectangle';
      const geoLabel = labelText.trim().split(/\s+/).slice(0, 2).join(' ');
      let icon: React.ReactNode;
      switch (geo) {
        case 'ellipse': icon = <Circle className={cls} />; break;
        case 'triangle': icon = <Triangle className={cls} />; break;
        case 'star': icon = <Star className={cls} />; break;
        default: icon = <Square className={cls} />;
      }
      return { icon, label: geoLabel || geo.charAt(0).toUpperCase() + geo.slice(1) };
    }
    case 'arrow': return { icon: <ArrowRight className={cls} />, label: 'Arrow' };
    case 'line': return { icon: <Minus className={cls} />, label: 'Line' };
    case 'draw': return { icon: <Pencil className={cls} />, label: 'Drawing' };
    case 'image': return { icon: <Image className={cls} />, label: 'Image' };
    case 'code-block': return { icon: <Square className={cls} />, label: 'Code' };
    case 'md-block': return { icon: <Square className={cls} />, label: 'Markdown' };
    default: return { icon: <Square className={cls} />, label: shape.type };
  }
}

// ─── Helper: get page-ordered groups from steps ──────────────────────────────
function getPageGroups(steps: AnimationStep[], editor: Editor | null): { pageId: string; pageName: string; startIndex: number; count: number }[] {
  if (steps.length === 0) return [];
  const pages = editor ? editor.getPages() : [];
  const pageNameMap = new Map<string, string>();
  pages.forEach((p, i) => pageNameMap.set(p.id as string, p.name || `Page ${i + 1}`));

  const groups: { pageId: string; pageName: string; startIndex: number; count: number }[] = [];
  let currentPageId = '';
  for (let i = 0; i < steps.length; i++) {
    const pid = steps[i].pageId || 'page:page';
    if (pid !== currentPageId) {
      currentPageId = pid;
      groups.push({
        pageId: pid,
        pageName: pageNameMap.get(pid) || 'Page 1',
        startIndex: i,
        count: 1,
      });
    } else {
      groups[groups.length - 1].count++;
    }
  }
  return groups;
}

export default function TimelineBar({
  steps,
  onStepsChange,
  editor,
  isLocked,
  diagramData,
  selectedShapeIds = [],
}: TimelineBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [moveMenuStepId, setMoveMenuStepId] = useState<string | null>(null);
  const [moveInput, setMoveInput] = useState('');
  const [moveMode, setMoveMode] = useState<'after' | 'before'>('after');

  // Auto-scroll timeline to selected card
  useEffect(() => {
    if (!scrollRef.current || selectedShapeIds.length === 0 || minimized) return;
    const selectedStepIndex = steps.findIndex(s => s.shapeIds.some(id => selectedShapeIds.includes(id)));
    if (selectedStepIndex === -1) return;
    const card = scrollRef.current.querySelector(`[data-timeline-index="${selectedStepIndex}"]`) as HTMLElement | null;
    if (!card) return;
    const container = scrollRef.current;
    const cardLeft = card.offsetLeft;
    const cardWidth = card.offsetWidth;
    const containerLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    if (cardLeft < containerLeft || cardLeft + cardWidth > containerLeft + containerWidth) {
      container.scrollTo({
        left: cardLeft - containerWidth / 2 + cardWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [selectedShapeIds, steps, minimized]);

  const updateStep = useCallback((id: string, updates: Partial<AnimationStep>) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [steps, onStepsChange]);

  const removeStep = useCallback((id: string) => {
    const step = steps.find(s => s.id === id);
    if (step && editor) {
      const action = step.action || 'enter';
      const isManual = action === 'exit' || action === 'move' || action === 'teleport' || action === 'swap';
      if (!isManual) {
        const tldrawIds = step.shapeIds.filter(sid => sid.includes(':'));
        if (tldrawIds.length > 0) {
          editor.deleteShapes(tldrawIds as any);
        }
      }
    }
    onStepsChange(steps.filter(s => s.id !== id));
  }, [steps, onStepsChange, editor]);

  const captureCamera = useCallback((stepId: string) => {
    if (!editor) return;
    const cam = editor.getCamera();
    updateStep(stepId, { cameraPosition: { x: cam.x, y: cam.y, z: cam.z } });
  }, [editor, updateStep]);

  const clearCamera = useCallback((stepId: string) => {
    updateStep(stepId, { cameraPosition: undefined });
  }, [updateStep]);

  const viewPosition = useCallback((step: AnimationStep) => {
    if (!editor || !step.cameraPosition) return;
    editor.setCamera(step.cameraPosition, { force: true, animation: { duration: 300 } });
  }, [editor]);

  // ─── Audio ──────────────────────────────────────────────────────────────
  const audioFileRef = useRef<HTMLInputElement>(null);
  const audioUploadStepRef = useRef<string>('');
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const audioPreviewCtxRef = useRef<AudioContext | null>(null);
  const audioPreviewGainRef = useRef<GainNode | null>(null);
  const [audioExpandedSteps, setAudioExpandedSteps] = useState<Set<string>>(new Set());

  const stopAudioPreview = useCallback(() => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
    }
  }, []);

  useEffect(() => {
    stopAudioPreview();
  }, [isLocked, stopAudioPreview]);

  const toggleAudioExpanded = useCallback((stepId: string) => {
    setAudioExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
        stopAudioPreview();
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, [stopAudioPreview]);

  const handleAudioUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const fileName = file.name;
    reader.onload = () => {
      const stepId = audioUploadStepRef.current;
      if (!stepId) return;
      const existing = steps.find(s => s.id === stepId)?.audio;
      onStepsChange(steps.map(s => s.id === stepId ? { ...s, audio: {
        data: reader.result as string,
        fileName,
        startTime: existing?.startTime ?? 0,
        endTime: existing?.endTime ?? 5,
        loop: existing?.loop ?? false,
        volume: existing?.volume ?? 0.8,
      }} : s));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [steps, onStepsChange]);

  const previewAudio = useCallback((step: AnimationStep) => {
    if (!step.audio?.data) return;
    stopAudioPreview();
    if (!audioPreviewCtxRef.current) audioPreviewCtxRef.current = new AudioContext();
    const ctx = audioPreviewCtxRef.current;
    const audio = new Audio(step.audio.data);
    audio.currentTime = step.audio.startTime;
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, step.audio.volume));
    source.connect(gain);
    gain.connect(ctx.destination);
    audioPreviewGainRef.current = gain;
    audio.play();
    const { endTime, startTime, loop } = step.audio;
    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime >= endTime) {
        if (loop) { audio.currentTime = startTime; } else { audio.pause(); audioPreviewRef.current = null; }
      }
    });
    audio.addEventListener('ended', () => {
      if (loop) { audio.currentTime = startTime; audio.play().catch(() => {}); } else { audioPreviewRef.current = null; }
    });
    audioPreviewRef.current = audio;
  }, [stopAudioPreview]);

  const clearAll = useCallback(() => {
    if (window.confirm('Delete all steps and shapes from canvas?')) {
      if (editor) {
        const allTldrawIds = steps
          .flatMap(s => s.shapeIds)
          .filter(id => id.includes(':'));
        if (allTldrawIds.length > 0) {
          editor.deleteShapes(allTldrawIds as any);
        }
      }
      onStepsChange([]);
    }
  }, [onStepsChange, steps, editor]);

  // Toggle card selection for grouping
  const toggleCardSelection = useCallback((stepId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      setSelectedCardIds(prev => {
        const next = new Set(prev);
        if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
        return next;
      });
    } else {
      setSelectedCardIds(new Set());
    }
  }, []);

  const groupSelectedCards = useCallback(() => {
    if (selectedCardIds.size < 2) return;
    const selectedSteps = steps.filter(s => selectedCardIds.has(s.id));
    if (selectedSteps.length < 2) return;
    const mergedShapeIds = selectedSteps.flatMap(s => s.shapeIds);
    const firstStep = selectedSteps[0];
    const mergedStep: AnimationStep = {
      ...firstStep,
      shapeIds: [...new Set(mergedShapeIds)],
    };
    const idsToRemove = new Set(selectedSteps.slice(1).map(s => s.id));
    const newSteps = steps
      .map(s => s.id === firstStep.id ? mergedStep : s)
      .filter(s => !idsToRemove.has(s.id));
    onStepsChange(newSteps);
    setSelectedCardIds(new Set());
  }, [selectedCardIds, steps, onStepsChange]);

  const ungroupCard = useCallback((stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step || step.shapeIds.length <= 1) return;
    const individualSteps: AnimationStep[] = step.shapeIds.map((shapeId, i) => ({
      id: `step-${Date.now()}-${i}`,
      shapeIds: [shapeId],
      animation: step.animation,
      duration: step.duration,
      label: `Step`,
      action: step.action,
      pageId: step.pageId,
      cameraPosition: i === 0 ? step.cameraPosition : undefined,
    }));
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const newSteps = [...steps];
    newSteps.splice(stepIndex, 1, ...individualSteps);
    onStepsChange(newSteps);
  }, [steps, onStepsChange]);

  // Manually add selected canvas elements to timeline
  const addManually = useCallback(() => {
    if (!editor) return;
    const ids = editor.getSelectedShapeIds() as string[];
    if (ids.length === 0) return;
    const pageId = editor.getCurrentPageId() as string;

    const newStep: AnimationStep = {
      id: `step-${Date.now()}`,
      shapeIds: [...ids],
      animation: 'appear' as AnimationType,
      duration: 800,
      label: `Step`,
      action: 'exit' as StepAction,
      pageId,
    };

    // Insert at end of current page's section
    const lastPageIndex = steps.map(s => s.pageId).lastIndexOf(pageId);
    if (lastPageIndex === -1) {
      onStepsChange([...steps, newStep]);
    } else {
      const result = [...steps];
      result.splice(lastPageIndex + 1, 0, newStep);
      onStepsChange(result);
    }
  }, [editor, steps, onStepsChange]);

  // ─── Move operations (replace drag) ─────────────────────────────────────
  const getPageBounds = useCallback((stepId: string): { pageId: string; pageStart: number; pageEnd: number } | null => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return null;
    const pid = step.pageId || 'page:page';
    let pageStart = -1;
    let pageEnd = -1;
    for (let i = 0; i < steps.length; i++) {
      if ((steps[i].pageId || 'page:page') === pid) {
        if (pageStart === -1) pageStart = i;
        pageEnd = i;
      }
    }
    return pageStart >= 0 ? { pageId: pid, pageStart, pageEnd } : null;
  }, [steps]);

  const moveToStart = useCallback((stepId: string) => {
    const bounds = getPageBounds(stepId);
    if (!bounds) return;
    const currentIndex = steps.findIndex(s => s.id === stepId);
    if (currentIndex === bounds.pageStart) return; // already at start
    const newSteps = [...steps];
    const [moved] = newSteps.splice(currentIndex, 1);
    newSteps.splice(bounds.pageStart, 0, moved);
    onStepsChange(newSteps);
    setMoveMenuStepId(null);
  }, [steps, onStepsChange, getPageBounds]);

  const moveToEnd = useCallback((stepId: string) => {
    const bounds = getPageBounds(stepId);
    if (!bounds) return;
    const currentIndex = steps.findIndex(s => s.id === stepId);
    if (currentIndex === bounds.pageEnd) return; // already at end
    const newSteps = [...steps];
    const [moved] = newSteps.splice(currentIndex, 1);
    // After splice, pageEnd might shift by -1 if current was before pageEnd
    const adjustedEnd = currentIndex < bounds.pageEnd ? bounds.pageEnd - 1 : bounds.pageEnd;
    newSteps.splice(adjustedEnd + 1, 0, moved);
    onStepsChange(newSteps);
    setMoveMenuStepId(null);
  }, [steps, onStepsChange, getPageBounds]);

  const moveToPosition = useCallback((stepId: string, position: number, mode: 'after' | 'before') => {
    const bounds = getPageBounds(stepId);
    if (!bounds) return;
    const currentIndex = steps.findIndex(s => s.id === stepId);
    // position is 1-based within the page
    const pageSteps = steps.filter(s => (s.pageId || 'page:page') === bounds.pageId);
    if (position < 1 || position > pageSteps.length) return;
    const currentPageLocalIndex = pageSteps.findIndex(s => s.id === stepId);
    if (position === currentPageLocalIndex + 1) return; // same position

    // Find the target step's global index
    const targetStepId = pageSteps[position - 1].id;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(currentIndex, 1);
    // Recalculate target index after removal
    let insertAt = newSteps.findIndex(s => s.id === targetStepId);
    if (insertAt === -1) insertAt = 0;
    if (mode === 'after') insertAt += 1;
    newSteps.splice(insertAt, 0, moved);
    onStepsChange(newSteps);
    setMoveMenuStepId(null);
    setMoveInput('');
  }, [steps, onStepsChange, getPageBounds]);

  // Click card → select shapes on canvas and pan to show them
  const handleCardClick = useCallback((step: AnimationStep) => {
    if (!editor || isLocked) return;
    const tldrawIds = step.shapeIds.filter(id => id.includes(':'));
    const rfIds = step.shapeIds.filter(id => !id.includes(':'));

    if (tldrawIds.length > 0) {
      editor.select(...tldrawIds as any);
    }

    if (rfIds.length > 0 && diagramData) {
      document.querySelectorAll('.react-flow__node.selected, .react-flow__edge.selected').forEach(el => {
        el.classList.remove('selected');
      });
      for (const rfId of rfIds) {
        const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement;
        if (el) el.classList.add('selected');
      }
    }

    if (step.cameraPosition) {
      editor.setCamera(step.cameraPosition, { force: true, animation: { duration: 300 } });
    } else if (tldrawIds.length > 0 || rfIds.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of tldrawIds) {
        const bounds = editor.getShapePageBounds(id as any);
        if (!bounds) continue;
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.w);
        maxY = Math.max(maxY, bounds.y + bounds.h);
      }
      if (diagramData) {
        for (const rfId of rfIds) {
          const node = diagramData.nodes.find((n: any) => n.id === rfId);
          if (node) {
            const pos = node.position as { x: number; y: number };
            const w = (node as any).measured?.width || (node as any).width || 130;
            const h = (node as any).measured?.height || (node as any).height || 75;
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + w);
            maxY = Math.max(maxY, pos.y + h);
          }
          const edge = diagramData.edges.find((e: any) => e.id === rfId);
          if (edge) {
            const src = diagramData.nodes.find((n: any) => n.id === edge.source);
            const tgt = diagramData.nodes.find((n: any) => n.id === edge.target);
            for (const nd of [src, tgt]) {
              if (!nd) continue;
              const pos = nd.position as { x: number; y: number };
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
              maxX = Math.max(maxX, pos.x + 130);
              maxY = Math.max(maxY, pos.y + 75);
            }
          }
        }
      }
      if (minX !== Infinity) {
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        editor.centerOnPoint({ x: centerX, y: centerY }, { animation: { duration: 300 } });
      }
    }
  }, [editor, isLocked, diagramData]);

  if (isLocked) {
    return null;
  }

  // ─── Compute page groups for rendering ──────────────────────────────────
  const pageGroups = getPageGroups(steps, editor);
  const pages = editor ? editor.getPages() : [];
  const pageIds = pages.map(p => p.id as string);
  const hasMultiplePages = pages.length > 1;

  // Build per-page local index for each step
  const pageLocalIndices: number[] = [];
  const pageCounters: Record<string, number> = {};
  for (const step of steps) {
    const pid = step.pageId || 'page:page';
    pageCounters[pid] = (pageCounters[pid] || 0) + 1;
    pageLocalIndices.push(pageCounters[pid]);
  }

  return (
    <div className="flex-shrink-0 bg-[#0a1230] border-t border-[#1a2a5e]">
      {/* Timeline header — drag handle */}
      <div data-drag-handle className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Timeline</span>
          <span className="text-[10px] text-slate-600">{steps.length} steps</span>
          {hasMultiplePages && <span className="text-[10px] text-slate-600">· {pages.length} pages</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {selectedCardIds.size >= 2 && (
            <button
              onClick={groupSelectedCards}
              className="flex items-center gap-1 text-[9px] text-emerald-400 hover:text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/10"
            >
              Group ({selectedCardIds.size})
            </button>
          )}
          <button
            onClick={addManually}
            className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/10"
            title="Add selected element(s) to timeline manually"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
          <button
            onClick={() => setMinimized(m => !m)}
            className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-300"
            title={minimized ? 'Expand timeline' : 'Minimize timeline'}
          >
            {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {steps.length > 0 && (
            <button
              onClick={clearAll}
              className="text-[9px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/10"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Timeline track */}
      {!minimized && (
      <div
        ref={scrollRef}
        className="flex items-stretch gap-0 px-3 py-2 overflow-x-auto"
        style={{ minHeight: 100 }}
      >
        {steps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px] text-slate-600">Add elements to the canvas — they appear here automatically</p>
          </div>
        ) : (
          <>
            {steps.map((step, index) => {
              const info = getShapeIcon(editor, step.shapeIds[0], diagramData);
              const extra = step.shapeIds.length > 1 ? `+${step.shapeIds.length - 1}` : '';
              const hasCamera = !!step.cameraPosition;
              const isSelected = step.shapeIds.some(id => selectedShapeIds.includes(id));
              const action = step.action || 'enter';
              const isManualCard = action === 'exit' || action === 'move' || action === 'teleport' || action === 'swap';
              const isMultiShape = step.shapeIds.length > 1;
              const pageLocalIndex = pageLocalIndices[index];
              const pid = step.pageId || 'page:page';
              const pageColorIdx = pageIds.indexOf(pid) % PAGE_COLORS.length;
              const pageColor = PAGE_COLORS[Math.max(0, pageColorIdx)];
              const isMoveMenuOpen = moveMenuStepId === step.id;

              // Check if this is the first card of a new page section
              const isFirstOfPage = index === 0 || (steps[index - 1].pageId || 'page:page') !== pid;

              return (
                <div key={step.id} className="flex items-stretch" data-timeline-index={index}>
                  {/* Page separator */}
                  {isFirstOfPage && hasMultiplePages && (
                    <div className="flex flex-col items-center justify-center px-1.5 flex-shrink-0">
                      <div className={`w-px flex-1 ${pageColor.border.replace('border-', 'bg-')}`} />
                      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full ${pageColor.label} ${pageColor.text} whitespace-nowrap my-1`}>
                        {pageGroups.find(g => g.pageId === pid)?.pageName || 'Page'}
                      </span>
                      <div className={`w-px flex-1 ${pageColor.border.replace('border-', 'bg-')}`} />
                    </div>
                  )}

                  {/* Card */}
                  <div
                    onClick={(e) => {
                      toggleCardSelection(step.id, e);
                      if (!e.metaKey && !e.ctrlKey) handleCardClick(step);
                      // Close move menu if clicking another card
                      if (moveMenuStepId && moveMenuStepId !== step.id) setMoveMenuStepId(null);
                    }}
                    className={`flex-shrink-0 w-44 rounded-lg border flex flex-col overflow-hidden transition-all cursor-pointer mx-1 ${
                      selectedCardIds.has(step.id)
                        ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/50'
                        : isSelected
                        ? 'border-amber-400 bg-amber-500/10'
                        : isManualCard
                        ? 'border-orange-700/60 bg-orange-900/20 hover:border-orange-600'
                        : hasMultiplePages
                        ? `${pageColor.border} ${pageColor.bg} hover:border-slate-500`
                        : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
                    }`}
                  >
                    {/* Step header */}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-700/40 bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={selectedCardIds.has(step.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedCardIds(prev => {
                            const next = new Set(prev);
                            if (next.has(step.id)) next.delete(step.id); else next.add(step.id);
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3 h-3 flex-shrink-0 accent-emerald-500 cursor-pointer"
                      />
                      <span className={`text-[9px] font-bold ${hasMultiplePages ? pageColor.text : 'text-slate-500'}`}>
                        {String(pageLocalIndex).padStart(2, '0')}
                      </span>
                      <span className="text-slate-400">{info.icon}</span>
                      <span className="text-[10px] font-medium text-slate-300 truncate flex-1">{info.label}</span>
                      {extra && <span className="text-[8px] text-slate-500">{extra}</span>}
                    </div>

                    {/* Controls */}
                    <div className="px-2 py-1.5 flex flex-col gap-1.5 flex-1">
                      {/* Animation/Action dropdown */}
                      {isManualCard ? (
                        <select
                          value={action}
                          onChange={(e) => updateStep(step.id, { action: e.target.value as StepAction })}
                          disabled={isMultiShape}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-full text-[9px] border border-orange-600/50 rounded px-1 py-1 bg-slate-800/50 text-orange-300 ${isMultiShape ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          {isMultiShape ? (
                            <option value="exit">Erase</option>
                          ) : (
                            MANUAL_ACTION_OPTIONS.map(a => (
                              <option key={a.value} value={a.value}>{a.label}</option>
                            ))
                          )}
                        </select>
                      ) : (
                        <select
                          value={step.action === 'blink' ? 'blink' : step.animation}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'blink') {
                              updateStep(step.id, { action: 'blink', animation: 'appear' as AnimationType });
                            } else {
                              updateStep(step.id, { action: 'enter', animation: val as AnimationType });
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-[9px] border border-slate-600/50 rounded px-1 py-1 bg-slate-800/50 text-slate-300"
                        >
                          {ANIMATION_OPTIONS.map(a => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>
                      )}

                      {/* Camera: Lock + View Position */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); captureCamera(step.id); }}
                          className={`flex items-center gap-0.5 px-1 py-1 rounded text-[8px] font-medium transition-all justify-center ${
                            hasCamera
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700'
                          }`}
                          title="Lock current camera view"
                        >
                          {hasCamera ? (
                            <><Camera className="w-2.5 h-2.5" /> {Math.round(step.cameraPosition!.z * 100)}%</>
                          ) : (
                            <><CameraOff className="w-2.5 h-2.5" /> Lock</>
                          )}
                        </button>
                        {hasCamera && (
                          <button
                            onClick={(e) => { e.stopPropagation(); viewPosition(step); }}
                            className="flex items-center gap-0.5 px-1 py-1 rounded text-[8px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all"
                            title="Jump to saved camera position"
                          >
                            <Eye className="w-2.5 h-2.5" /> View
                          </button>
                        )}
                        {hasCamera && (
                          <button
                            onClick={(e) => { e.stopPropagation(); clearCamera(step.id); }}
                            className="p-0.5 rounded text-[8px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                            title="Remove camera lock"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Audio — collapsible */}
                    <div className="px-2 pb-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleAudioExpanded(step.id); }}
                        className={`flex items-center gap-1 w-full px-1 py-0.5 rounded text-[8px] font-medium transition-all ${
                          step.audio?.data ? 'text-emerald-300' : audioExpandedSteps.has(step.id) ? 'text-slate-300' : 'text-slate-500'
                        } hover:bg-slate-700/30`}
                      >
                        {step.audio?.data ? <Volume2 className="w-2.5 h-2.5" /> : <VolumeX className="w-2.5 h-2.5" />}
                        {step.audio?.data ? step.audio.fileName || 'Audio' : 'Audio'}
                        <ChevronDown className={`w-2.5 h-2.5 ml-auto transition-transform ${audioExpandedSteps.has(step.id) ? 'rotate-180' : ''}`} />
                      </button>
                      {audioExpandedSteps.has(step.id) && (
                        <div className="mt-1 space-y-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          {step.audio?.data ? (
                            <>
                              <div className="flex items-center gap-1">
                                <button onClick={() => previewAudio(step)} className="px-1 py-0.5 rounded text-[8px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">▶</button>
                                <button onClick={() => stopAudioPreview()} className="px-1 py-0.5 rounded text-[8px] bg-slate-700/50 text-slate-300 border border-slate-600/30">⏹</button>
                                <button onClick={() => updateStep(step.id, { audio: undefined })} className="px-1 py-0.5 rounded text-[8px] text-red-400 border border-red-500/20">✕</button>
                              </div>
                              <div className="flex items-center gap-1 text-[8px] text-slate-500">
                                <span>Start</span>
                                <input type="number" value={step.audio.startTime} onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, startTime: Math.max(0, Number(e.target.value)) } })} className="w-8 border border-slate-600/50 rounded px-0.5 py-0.5 text-center bg-slate-800/50 text-slate-300 text-[8px]" min={0} step={0.5} />
                                <span>End</span>
                                <input type="number" value={step.audio.endTime} onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, endTime: Math.max(0, Number(e.target.value)) } })} className="w-8 border border-slate-600/50 rounded px-0.5 py-0.5 text-center bg-slate-800/50 text-slate-300 text-[8px]" min={0} step={0.5} />
                                <span>s</span>
                              </div>
                              <div className="flex items-center gap-1 text-[8px] text-slate-500">
                                <label className="flex items-center gap-0.5 cursor-pointer">
                                  <input type="checkbox" checked={step.audio.loop} onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, loop: e.target.checked } })} style={{ width: 8, height: 8 }} />
                                  Loop
                                </label>
                                <span>Vol</span>
                                <input type="range" min={0} max={100} step={5} value={Math.round(step.audio.volume * 100)} onChange={(e) => { const v = Number(e.target.value) / 100; updateStep(step.id, { audio: { ...step.audio!, volume: v } }); if (audioPreviewGainRef.current) audioPreviewGainRef.current.gain.value = v; }} className="w-12 h-1" style={{ accentColor: '#10b981' }} />
                                <span>{Math.round(step.audio.volume * 100)}%</span>
                              </div>
                            </>
                          ) : step.audio && !step.audio.data ? (
                            <button onClick={() => { audioUploadStepRef.current = step.id; audioFileRef.current?.click(); }} className="flex items-center gap-1 px-1 py-0.5 rounded text-[8px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              🔊 Re-add: {step.audio.fileName || 'audio'}
                            </button>
                          ) : (
                            <button onClick={() => { audioUploadStepRef.current = step.id; audioFileRef.current?.click(); }} className="flex items-center gap-1 px-1 py-0.5 rounded text-[8px] bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700">
                              <VolumeX className="w-2.5 h-2.5" /> Add Audio
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Step footer — move, delete, ungroup */}
                    <div className="flex items-center justify-between px-1.5 py-1 border-t border-slate-700/40 bg-slate-800/60">
                      <div className="flex items-center gap-1">
                        {step.shapeIds.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); ungroupCard(step.id); }}
                            className="text-[8px] text-blue-400/60 hover:text-blue-400 px-1 py-0.5 rounded hover:bg-blue-500/10"
                          >
                            Ungroup
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setMoveMenuStepId(isMoveMenuOpen ? null : step.id); setMoveInput(''); }}
                          className={`flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded transition-all ${
                            isMoveMenuOpen ? 'text-blue-300 bg-blue-500/15 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                          }`}
                          title="Move card position"
                        >
                          <MoveHorizontal className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeStep(step.id); }} className="p-0.5 rounded hover:bg-red-500/10">
                        <Trash2 className="w-3 h-3 text-red-400/60 hover:text-red-400" />
                      </button>
                    </div>

                    {/* Move menu — dropdown below footer */}
                    {isMoveMenuOpen && (
                      <div className="px-2 py-1.5 border-t border-blue-500/20 bg-slate-900/80 space-y-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveToStart(step.id)}
                            className="flex-1 text-[8px] px-1 py-1 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/30"
                          >
                            ⇤ Start
                          </button>
                          <button
                            onClick={() => moveToEnd(step.id)}
                            className="flex-1 text-[8px] px-1 py-1 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/30"
                          >
                            End ⇥
                          </button>
                        </div>
                        <div className="flex gap-1 items-center">
                          <select
                            value={moveMode}
                            onChange={(e) => setMoveMode(e.target.value as 'after' | 'before')}
                            className="text-[8px] border border-slate-600/50 rounded px-0.5 py-1 bg-slate-800/50 text-slate-300"
                          >
                            <option value="after">After #</option>
                            <option value="before">Before #</option>
                          </select>
                          <input
                            type="number"
                            value={moveInput}
                            onChange={(e) => setMoveInput(e.target.value)}
                            placeholder="#"
                            min={1}
                            className="w-8 text-[8px] border border-slate-600/50 rounded px-0.5 py-1 text-center bg-slate-800/50 text-slate-300"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && moveInput) {
                                moveToPosition(step.id, Number(moveInput), moveMode);
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              if (moveInput) moveToPosition(step.id, Number(moveInput), moveMode);
                            }}
                            disabled={!moveInput}
                            className="text-[8px] px-1.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Go
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      )}
      {/* Hidden audio file input */}
      <input ref={audioFileRef} type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: 'none' }} />
    </div>
  );
}
