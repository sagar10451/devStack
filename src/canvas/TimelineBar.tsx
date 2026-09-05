/**
 * TimelineBar — horizontal bottom bar showing animation steps as a timeline.
 * Each step is a card showing shape info, action type, and camera lock button.
 * Shapes auto-added when created on canvas.
 */

import { useCallback, useRef } from 'react';
import {
  Trash2, ChevronLeft, ChevronRight, Camera, CameraOff,
  Type, Square, ArrowRight, Image, Pencil, Circle, Triangle, Star, Minus,
  GitBranch, Cable,
} from 'lucide-react';
import type { AnimationStep, AnimationType, StepAction } from './types';
import type { Editor } from 'tldraw';
import type { DiagramData } from './diagram/diagramTypes';
import { getIconComponent } from './diagram/iconRegistry';

interface TimelineBarProps {
  steps: AnimationStep[];
  onStepsChange: (steps: AnimationStep[]) => void;
  editor: Editor | null;
  currentStep: number;
  isLocked: boolean;
  diagramData?: DiagramData;
}

const actionOptions: { value: StepAction; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'enter', label: 'Enter' },
  { value: 'exit', label: 'Exit' },
  { value: 'blink', label: 'Blink' },
  { value: 'move', label: 'Move' },
  { value: 'teleport', label: 'Teleport' },
  { value: 'swap', label: 'Swap' },
];

const animationTypes: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'appear', label: 'Appear' },
  { value: 'fadeIn', label: 'Fade In' },
  { value: 'flyInLeft', label: 'Fly Left' },
  { value: 'flyInRight', label: 'Fly Right' },
  { value: 'flyInTop', label: 'Fly Top' },
  { value: 'flyInBottom', label: 'Fly Bottom' },
  { value: 'slideInLeft', label: 'Slide Left' },
  { value: 'slideInRight', label: 'Slide Right' },
  { value: 'slideInTop', label: 'Slide Top' },
  { value: 'slideInBottom', label: 'Slide Bottom' },
  { value: 'zoomIn', label: 'Zoom In' },
  { value: 'zoomOut', label: 'Zoom Out' },
  { value: 'pop', label: 'Pop' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'revealLeft', label: 'Reveal L→R' },
  { value: 'revealRight', label: 'Reveal R→L' },
  { value: 'revealTop', label: 'Reveal T→D' },
  { value: 'revealBottom', label: 'Reveal B→U' },
  { value: 'revealCenter', label: 'Reveal Center' },
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

export default function TimelineBar({
  steps,
  onStepsChange,
  editor,
  currentStep,
  isLocked,
  diagramData,
}: TimelineBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const preZoomCameraRef = useRef<Record<string, { x: number; y: number; z: number }>>({});

  const updateStep = useCallback((id: string, updates: Partial<AnimationStep>) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [steps, onStepsChange]);

  const removeStep = useCallback((id: string) => {
    onStepsChange(steps.filter(s => s.id !== id));
  }, [steps, onStepsChange]);

  const moveStep = useCallback((index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    onStepsChange(newSteps);
  }, [steps, onStepsChange]);

  const captureCamera = useCallback((stepId: string) => {
    if (!editor) return;
    const cam = editor.getCamera();
    updateStep(stepId, { cameraPosition: { x: cam.x, y: cam.y, z: cam.z } });
    // Restore to pre-capture view
    const preCam = preZoomCameraRef.current[stepId];
    if (preCam) {
      editor.setCamera(preCam, { force: true });
    }
  }, [editor, updateStep]);

  const clearCamera = useCallback((stepId: string) => {
    updateStep(stepId, { cameraPosition: undefined });
    delete preZoomCameraRef.current[stepId];
  }, [updateStep]);

  const clearAll = useCallback(() => {
    if (window.confirm('Delete all steps from timeline?')) {
      onStepsChange([]);
    }
  }, [onStepsChange]);

  if (isLocked) {
    // In locked mode, show minimal playback indicator
    return (
      <div className="flex-shrink-0 h-12 bg-[#0a1230] border-t border-[#1a2a5e] flex items-center px-4 gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Timeline</span>
        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
          {steps.map((step, i) => {
            const isActive = i === currentStep;
            const isPast = i < currentStep;
            return (
              <div
                key={step.id}
                className={`flex-shrink-0 w-8 h-2 rounded-full transition-all ${
                  isActive ? 'bg-blue-500 w-12' : isPast ? 'bg-blue-800' : 'bg-slate-700'
                }`}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-slate-500">
          {currentStep + 1} / {steps.length}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 bg-[#0a1230] border-t border-[#1a2a5e]">
      {/* Timeline header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Timeline</span>
          <span className="text-[10px] text-slate-600">{steps.length} steps</span>
        </div>
        {steps.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[9px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/10"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Timeline track */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-2 px-3 py-2 overflow-x-auto"
        style={{ minHeight: 100 }}
      >
        {steps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px] text-slate-600">Add elements to the canvas — they appear here automatically</p>
          </div>
        ) : (
          steps.map((step, index) => {
            const info = getShapeIcon(editor, step.shapeIds[0], diagramData);
            const extra = step.shapeIds.length > 1 ? `+${step.shapeIds.length - 1}` : '';
            const action = step.action || 'enter';
            const hasCamera = !!step.cameraPosition;

            return (
              <div
                key={step.id}
                className="flex-shrink-0 w-44 rounded-lg border border-slate-700/60 bg-slate-800/40 flex flex-col overflow-hidden hover:border-slate-600 transition-colors"
              >
                {/* Step header */}
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-700/40 bg-slate-800/60">
                  <span className="text-[9px] font-bold text-slate-500">{(index + 1).toString().padStart(2, '0')}</span>
                  <span className="text-slate-400">{info.icon}</span>
                  <span className="text-[10px] font-medium text-slate-300 truncate flex-1">{info.label}</span>
                  {extra && <span className="text-[8px] text-slate-500">{extra}</span>}
                </div>

                {/* Controls */}
                <div className="px-2 py-1.5 flex flex-col gap-1.5 flex-1">
                  {/* Action + Animation */}
                  <div className="flex items-center gap-1">
                    <select
                      value={action}
                      onChange={(e) => updateStep(step.id, { action: e.target.value as StepAction })}
                      className="flex-1 text-[9px] border border-slate-600/50 rounded px-1 py-0.5 bg-slate-800/50 text-slate-300"
                    >
                      {actionOptions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    {(action === 'enter' || action === 'exit') && (
                      <select
                        value={step.animation}
                        onChange={(e) => updateStep(step.id, { animation: e.target.value as AnimationType })}
                        className="flex-1 text-[9px] border border-slate-600/50 rounded px-1 py-0.5 bg-slate-800/50 text-slate-300"
                      >
                        {animationTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Camera lock button */}
                  <button
                    onClick={() => hasCamera ? clearCamera(step.id) : captureCamera(step.id)}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium transition-all w-full justify-center ${
                      hasCamera
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700'
                    }`}
                  >
                    {hasCamera ? (
                      <><Camera className="w-3 h-3" /> {Math.round(step.cameraPosition!.z * 100)}%</>
                    ) : (
                      <><CameraOff className="w-3 h-3" /> Lock Camera</>
                    )}
                  </button>
                </div>

                {/* Step footer — move/delete */}
                <div className="flex items-center justify-between px-1.5 py-1 border-t border-slate-700/40 bg-slate-800/60">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveStep(index, 'left')} disabled={index === 0} className="p-0.5 rounded hover:bg-slate-700/50 disabled:opacity-20">
                      <ChevronLeft className="w-3 h-3 text-slate-400" />
                    </button>
                    <button onClick={() => moveStep(index, 'right')} disabled={index === steps.length - 1} className="p-0.5 rounded hover:bg-slate-700/50 disabled:opacity-20">
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </button>
                  </div>
                  <button onClick={() => removeStep(step.id)} className="p-0.5 rounded hover:bg-red-500/10">
                    <Trash2 className="w-3 h-3 text-red-400/60 hover:text-red-400" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
