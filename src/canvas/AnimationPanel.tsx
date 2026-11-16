import { getSceneCamera, setSceneCamera } from './sceneLayout';
import {
  Plus, Trash2, ChevronUp, ChevronDown,
  Type, Square, ArrowRight, Image, Pencil, Circle, Triangle, Star, Minus,
  GitBranch, Cable, Crosshair, Volume2, VolumeX,
} from 'lucide-react';
import type { AnimationStep, AnimationType, StepAction } from './types';
import type { Editor } from 'tldraw';
import type { DiagramData } from './diagram/diagramTypes';
import { getIconComponent } from './diagram/iconRegistry';
import { useRef, useCallback } from 'react';

interface AnimationPanelProps {
  steps: AnimationStep[];
  onStepsChange: (steps: AnimationStep[]) => void;
  editor: Editor | null;
  rfSelectedNodeIds?: string[];
  rfSelectedEdgeIds?: string[];
  diagramData?: DiagramData;
  /** Callback to enter "pick destination" mode on the canvas */
  onPickDestination?: (stepId: string) => void;
}

const actionOptions: { value: StepAction; label: string; desc: string }[] = [
  { value: 'none', label: 'None', desc: 'Camera only, no animation' },
  { value: 'enter', label: 'Enter', desc: 'Shapes appear' },
  { value: 'exit', label: 'Exit', desc: 'Shapes disappear' },
  { value: 'blink', label: 'Blink', desc: 'Flash in place' },
  { value: 'move', label: 'Move', desc: 'Slide to position' },
  { value: 'teleport', label: 'Teleport', desc: 'Jump to position' },
  { value: 'swap', label: 'Swap', desc: 'Replace shapes' },
];

const animationTypes: { value: AnimationType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'appear', label: 'Appear' },
  { value: 'fadeIn', label: 'Fade In' },
  { value: 'flyInLeft', label: 'Fly In Left' },
  { value: 'flyInRight', label: 'Fly In Right' },
  { value: 'flyInTop', label: 'Fly In Top' },
  { value: 'flyInBottom', label: 'Fly In Bottom' },
  { value: 'slideInLeft', label: 'Slide In Left' },
  { value: 'slideInRight', label: 'Slide In Right' },
  { value: 'slideInTop', label: 'Slide In Top' },
  { value: 'slideInBottom', label: 'Slide In Bottom' },
  { value: 'zoomIn', label: 'Zoom In' },
  { value: 'zoomOut', label: 'Zoom Out' },
  { value: 'pop', label: 'Pop' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'idleFloat', label: 'Float (loop)' },
  { value: 'idleShake', label: 'Shake (loop)' },
  { value: 'idlePulse', label: 'Pulse (loop)' },
  { value: 'idleBounce', label: 'Bounce (loop)' },
  { value: 'idleBreathe', label: 'Breathe (loop)' },
  { value: 'idleWiggle', label: 'Wiggle (loop)' },
  { value: 'idleSway', label: 'Sway (loop)' },
  { value: 'revealLeft', label: 'Reveal Left→Right' },
  { value: 'revealRight', label: 'Reveal Right→Left' },
  { value: 'revealTop', label: 'Reveal Top→Down' },
  { value: 'revealBottom', label: 'Reveal Bottom→Up' },
  { value: 'revealCenter', label: 'Reveal Center Out' },
];

function getShapeInfo(
  editor: Editor | null,
  shapeId: string,
  diagramData?: DiagramData,
): { icon: React.ReactNode; label: string } {
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
  if (!shape) return { icon: <Square className={cls} />, label: 'Unknown' };
  switch (shape.type) {
    case 'text': {
      const props = shape.props as any;
      let text = '';
      try {
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
      const words = text.trim().split(/\s+/).slice(0, 2).join(' ') || 'Text';
      return { icon: <Type className={cls} />, label: words };
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
    default: return { icon: <Square className={cls} />, label: shape.type };
  }
}

export default function AnimationPanel({
  steps,
  onStepsChange,
  editor,
  rfSelectedNodeIds = [],
  rfSelectedEdgeIds = [],
  diagramData,
  onPickDestination,
}: AnimationPanelProps) {

  // Stores camera position from before user starts zooming for capture
  const preZoomCameraRef = useRef<Record<string, { x: number; y: number; z: number }>>({});
  const audioFileRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const audioPreviewCtxRef = useRef<AudioContext | null>(null);
  const audioPreviewGainRef = useRef<GainNode | null>(null);
  const audioUploadStepRef = useRef<string>('');

  const addStep = () => {
    let selectedIds: string[] = [];

    // Get tldraw selection
    if (editor) {
      const tldrawIds = editor.getSelectedShapeIds() as string[];
      selectedIds.push(...tldrawIds);
    }

    // Only add RF selection if NO tldraw shapes are selected
    // This prevents stale RF selections from leaking into tldraw-only steps
    if (selectedIds.length === 0) {
      selectedIds.push(...rfSelectedNodeIds, ...rfSelectedEdgeIds);
    }

    if (selectedIds.length === 0) return;

    const newStep: AnimationStep = {
      id: `step-${Date.now()}`,
      shapeIds: selectedIds,
      animation: 'appear',
      duration: 800,
      label: `Step ${steps.length + 1}`,
      action: 'enter',
    };
    // Save current camera at step creation — used to restore after capture
    if (editor) {
      const cam = getSceneCamera(editor);
      preZoomCameraRef.current[newStep.id] = { x: cam.x, y: cam.y, z: cam.z };
    }
    onStepsChange([...steps, newStep]);
  };

  const setExitShapes = (stepId: string) => {
    let selectedIds: string[] = [];
    if (editor) {
      const tldrawIds = editor.getSelectedShapeIds() as string[];
      selectedIds.push(...tldrawIds);
    }
    selectedIds.push(...rfSelectedNodeIds, ...rfSelectedEdgeIds);
    if (selectedIds.length === 0) return;

    onStepsChange(steps.map(s => s.id === stepId ? { ...s, exitShapeIds: selectedIds } : s));
  };

  const removeStep = (id: string) => {
    onStepsChange(steps.filter(s => s.id !== id));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    onStepsChange(newSteps);
  };

  const updateStep = (id: string, updates: Partial<AnimationStep>) => {
    onStepsChange(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleAudioUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const fileName = file.name;
    reader.onload = () => {
      const stepId = audioUploadStepRef.current;
      if (!stepId) return;
      const existingStep = steps.find(s => s.id === stepId);
      const existingAudio = existingStep?.audio;
      onStepsChange(steps.map(s => s.id === stepId ? { ...s, audio: {
        data: reader.result as string,
        fileName,
        startTime: existingAudio?.startTime ?? 0,
        endTime: existingAudio?.endTime ?? 5,
        loop: existingAudio?.loop ?? false,
        volume: existingAudio?.volume ?? 0.8,
      }} : s));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [steps, onStepsChange]);

  const previewAudio = useCallback((step: AnimationStep) => {
    if (!step.audio || !step.audio.data) return;
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      audioPreviewRef.current = null;
    }
    if (!audioPreviewCtxRef.current) {
      audioPreviewCtxRef.current = new AudioContext();
    }
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
    const endTime = step.audio.endTime;
    const startTime = step.audio.startTime;
    const loop = step.audio.loop;

    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime >= endTime) {
        if (loop) {
          audio.currentTime = startTime;
        } else {
          audio.pause();
          audioPreviewRef.current = null;
          audioPreviewGainRef.current = null;
        }
      }
    });
    audio.addEventListener('ended', () => {
      if (loop) {
        audio.currentTime = startTime;
        audio.play().catch(() => {});
      } else {
        audioPreviewRef.current = null;
        audioPreviewGainRef.current = null;
      }
    });
    audioPreviewRef.current = audio;
  }, []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <span className="text-xs text-slate-400">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-1.5">
          {steps.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete all steps?')) {
                  onStepsChange([]);
                }
              }}
              className="flex items-center gap-1 px-2 py-1.5 text-red-400 text-xs font-medium rounded-lg hover:bg-red-500/10 transition-colors border border-red-500/20"
              title="Clear all steps"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={addStep}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
            title="Select shapes or nodes, then click to add step"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {steps.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-xs text-slate-500">No animation steps yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Select shapes or nodes on canvas, then click "Add".
            </p>
          </div>
        ) : (
          steps.map((step, index) => {
            const info = getShapeInfo(editor, step.shapeIds[0], diagramData);
            const extra = step.shapeIds.length > 1 ? ` (+${step.shapeIds.length - 1})` : '';
            const hasRfItems = step.shapeIds.some(id => !id.includes(':'));
            const action = step.action || 'enter';
            const needsTarget = action === 'move' || action === 'teleport';
            const hasTarget = !!step.targetPosition;

            return (
              <div
                key={step.id}
                className="rounded-lg border border-slate-700/50 p-3 bg-slate-800/30 transition-all"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 w-5">{(index + 1).toString().padStart(2, '0')}</span>
                    <span className={hasRfItems ? 'text-blue-400' : 'text-slate-400'}>{info.icon}</span>
                    <span className="text-sm font-medium text-slate-200 truncate max-w-[100px]">{info.label}{extra}</span>
                    {hasRfItems && (
                      <span className="text-[9px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">RF</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveStep(index, 'up')} disabled={index === 0} className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30">
                      <ChevronUp className="w-3 h-3 text-slate-400" />
                    </button>
                    <button onClick={() => moveStep(index, 'down')} disabled={index === steps.length - 1} className="p-1 rounded hover:bg-slate-700/50 disabled:opacity-30">
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>
                    <button onClick={() => removeStep(step.id)} className="p-1 rounded hover:bg-red-500/10">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Controls row */}
                <div className="mt-2 pt-2 border-t border-slate-700/30 space-y-2">
                  {/* Action + Animation + Duration row */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={action}
                      onChange={(e) => updateStep(step.id, { action: e.target.value as StepAction })}
                      className="w-20 text-[10px] border border-slate-600/50 rounded-md px-1.5 py-1.5 bg-slate-800/50 text-slate-200"
                    >
                      {actionOptions.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    {(action === 'enter' || action === 'exit') && (
                      <select
                        value={step.animation}
                        onChange={(e) => updateStep(step.id, { animation: e.target.value as AnimationType })}
                        className="flex-1 text-[10px] border border-slate-600/50 rounded-md px-1.5 py-1.5 bg-slate-800/50 text-slate-200"
                      >
                        {animationTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    )}
                    <input
                      type="number"
                      value={step.duration}
                      onChange={(e) => updateStep(step.id, { duration: Number(e.target.value) })}
                      className="w-14 text-[10px] border border-slate-600/50 rounded-md px-1.5 py-1.5 bg-slate-800/50 text-slate-200"
                      min={100}
                      step={100}
                      title="Duration (ms)"
                    />
                    <span className="text-[9px] text-slate-500">ms</span>
                  </div>

                  {/* Move/Teleport: target position picker */}
                  {needsTarget && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onPickDestination?.(step.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${hasTarget ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/50 text-slate-300 border border-slate-600/30 hover:bg-slate-700'}`}
                      >
                        <Crosshair className="w-3 h-3" />
                        {hasTarget ? `Target: ${Math.round(step.targetPosition!.x)}, ${Math.round(step.targetPosition!.y)}` : 'Pick Destination'}
                      </button>
                    </div>
                  )}

                  {/* Swap: exit shapes selector */}
                  {action === 'swap' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">Exit shapes:</span>
                        <button
                          onClick={() => setExitShapes(step.id)}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/30 hover:bg-slate-700"
                        >
                          {step.exitShapeIds?.length ? `${step.exitShapeIds.length} set — click to update` : 'Use current selection'}
                        </button>
                      </div>
                      {!step.exitShapeIds?.length && (
                        <p className="text-[9px] text-amber-400/70">Select shapes on canvas first, then click the button</p>
                      )}
                    </div>
                  )}

                  {/* Camera capture — available on any step type */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (!editor) return;
                        // Capture current camera view
                        const cam = getSceneCamera(editor);
                        updateStep(step.id, { cameraPosition: { x: cam.x, y: cam.y, z: cam.z } });
                        // Restore to pre-capture view (saved when step was created)
                        const preCam = preZoomCameraRef.current[step.id];
                        if (preCam) {
                          setSceneCamera(editor, preCam, { force: true });
                        }
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${step.cameraPosition ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30' : 'bg-slate-700/50 text-slate-300 border border-slate-600/30 hover:bg-slate-700'}`}
                    >
                      📷
                      {step.cameraPosition
                        ? `View: ${Math.round(step.cameraPosition.z * 100)}%`
                        : 'Capture View'}
                    </button>
                    {step.cameraPosition && (
                      <button
                        onClick={() => {
                          updateStep(step.id, { cameraPosition: undefined });
                          delete preZoomCameraRef.current[step.id];
                        }}
                        className="px-1.5 py-1 rounded text-[10px] font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
                        title="Remove captured view"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Audio — optional sound effect for this step */}
                  <div className="flex flex-col gap-1.5">
                    {step.audio && step.audio.data ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          <span className="text-[10px] text-emerald-300 font-medium truncate max-w-[100px]" title={step.audio.fileName}>{step.audio.fileName || 'Audio'}</span>
                          <button
                            onClick={() => previewAudio(step)}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
                          >
                            ▶
                          </button>
                          <button
                            onClick={() => {
                              if (audioPreviewRef.current) { audioPreviewRef.current.pause(); audioPreviewRef.current = null; }
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/30 hover:bg-slate-700"
                          >
                            ⏹
                          </button>
                          <button
                            onClick={() => updateStep(step.id, { audio: undefined })}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-500 w-8">Start</span>
                          <input
                            type="number"
                            value={step.audio.startTime}
                            onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, startTime: Math.max(0, Number(e.target.value)) } })}
                            className="w-12 text-[10px] border border-slate-600/50 rounded px-1.5 py-1 bg-slate-800/50 text-slate-200"
                            min={0}
                            step={0.5}
                          />
                          <span className="text-[9px] text-slate-500 w-6">End</span>
                          <input
                            type="number"
                            value={step.audio.endTime}
                            onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, endTime: Math.max(0, Number(e.target.value)) } })}
                            className="w-12 text-[10px] border border-slate-600/50 rounded px-1.5 py-1 bg-slate-800/50 text-slate-200"
                            min={0}
                            step={0.5}
                          />
                          <span className="text-[9px] text-slate-500">sec</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-[9px] text-slate-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={step.audio.loop}
                              onChange={(e) => updateStep(step.id, { audio: { ...step.audio!, loop: e.target.checked } })}
                              style={{ width: 10, height: 10 }}
                            />
                            Loop
                          </label>
                          <span className="text-[9px] text-slate-500">Vol</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(step.audio.volume * 100)}
                            onChange={(e) => {
                              const newVol = Number(e.target.value) / 100;
                              updateStep(step.id, { audio: { ...step.audio!, volume: newVol } });
                              // Apply immediately via GainNode
                              if (audioPreviewGainRef.current) {
                                audioPreviewGainRef.current.gain.value = newVol;
                              }
                            }}
                            className="w-20 h-1.5"
                            style={{ accentColor: '#10b981' }}
                          />
                          <span className="text-[9px] text-slate-500 w-7">{Math.round(step.audio.volume * 100)}%</span>
                        </div>
                      </>
                    ) : step.audio && !step.audio.data ? (
                      /* Audio config exists but data was stripped (after refresh) — show re-add */
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <button
                          onClick={() => {
                            audioUploadStepRef.current = step.id;
                            audioFileRef.current?.click();
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                        >
                          🔊 Re-add: {step.audio.fileName || 'audio file'}
                        </button>
                        <button
                          onClick={() => updateStep(step.id, { audio: undefined })}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          audioUploadStepRef.current = step.id;
                          audioFileRef.current?.click();
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 border border-slate-600/30 hover:bg-slate-700 w-fit"
                      >
                        <VolumeX className="w-3 h-3" />
                        Add Audio
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {/* Hidden audio file input */}
      <input
        ref={audioFileRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
}
