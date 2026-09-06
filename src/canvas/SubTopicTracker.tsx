import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { playSuccessSound, celebrateAllComplete } from './celebration';
import type { SubTopicLabel, AnimationStep } from './types';

// ─── Feature flags ───────────────────────────────────────────────────────────
const ENABLE_COMPLETION_SOUND = false;   // Set to false to disable sub-topic ding sound
const ENABLE_PARTY_POPPER = false;       // Set to false to disable final confetti celebration
// ─────────────────────────────────────────────────────────────────────────────
interface SubTopicTrackerProps {
  labels: SubTopicLabel[];
  onLabelsChange: (labels: SubTopicLabel[]) => void;
  steps: AnimationStep[];
  isLocked: boolean;
  currentStep: number;
  sidebar?: boolean;
  sidebarTitle?: string;
  onSidebarTitleChange?: (title: string) => void;
}

const SIDEBAR_TITLE_OPTIONS = ['Outline', 'Scenes', 'Topics', 'Contents', 'Agenda', 'Chapter Breakdown', 'Progress'];

export default function SubTopicTracker({ labels, onLabelsChange, steps, isLocked, currentStep, sidebar, sidebarTitle = 'Outline', onSidebarTitleChange }: SubTopicTrackerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    // Only drag from the header area
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;

    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const parentRect = containerRef.current.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
    
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left - parentRect.left,
      origY: rect.top - parentRect.top,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const prevStepRef = useRef(currentStep);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Detect sub-topic completion — play sound + trigger CSS animation
  useEffect(() => {
    if (!isLocked) return;
    if (currentStep <= prevStepRef.current) {
      prevStepRef.current = currentStep;
      return;
    }
    const computed = labels.map((label, idx) => {
      if (idx === 0) return label;
      return { ...label, startStep: labels[idx - 1].endStep + 1 };
    });
    for (let i = 0; i < computed.length; i++) {
      const label = computed[i];
      if (currentStep === label.endStep && prevStepRef.current < label.endStep) {
        if (i < computed.length - 1) {
          if (ENABLE_COMPLETION_SOUND) playSuccessSound();
        }
        setJustCompletedId(label.id);
        setTimeout(() => setJustCompletedId(null), 900);
        break;
      }
    }

    // Final celebration — when the very last animation step is reached
    if (currentStep === steps.length - 1 && prevStepRef.current < steps.length - 1) {
      if (ENABLE_PARTY_POPPER) setTimeout(() => celebrateAllComplete(), 1500);
      // Mark last sub-topic as just completed
      if (computed.length > 0) {
        const lastLabel = computed[computed.length - 1];
        setJustCompletedId(lastLabel.id);
        setTimeout(() => setJustCompletedId(null), 900);
      }
    }
    prevStepRef.current = currentStep;
  }, [currentStep, isLocked, labels]);

  // Auto-scroll to keep active sub-topic visible with context
  useEffect(() => {
    if (!isLocked || !listRef.current) return;
    const computed = labels.map((label, idx) => {
      if (idx === 0) return label;
      return { ...label, startStep: labels[idx - 1].endStep + 1 };
    });
    let activeIdx = -1;
    for (let i = 0; i < computed.length; i++) {
      if (currentStep >= computed[i].startStep) activeIdx = i;
    }
    if (activeIdx >= 0) {
      const items = listRef.current.children;
      // When it's the last item or near the end, scroll fully to bottom
      if (activeIdx >= items.length - 2) {
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      } else {
        // Show 2 ahead
        const forwardTarget = Math.min(activeIdx + 2, items.length - 1);
        if (items[forwardTarget]) {
          (items[forwardTarget] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        setTimeout(() => {
          if (items[activeIdx]) {
            (items[activeIdx] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 150);
      }
    } else {
      // Going back past the start — scroll to top
      if (listRef.current) {
        listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [currentStep, isLocked, labels]);

  // Auto-cascade: compute startStep for each label based on previous label's endStep
  // First label keeps its own startStep (editable), rest auto-cascade
  const computedLabels = labels.map((label, idx) => {
    if (idx === 0) return label; // first label's startStep is user-editable
    const prevEnd = labels[idx - 1].endStep;
    return { ...label, startStep: prevEnd + 1 };
  });

  const addLabel = () => {
    const lastEnd = labels.length > 0 ? labels[labels.length - 1].endStep : -1;
    const newStart = lastEnd + 1;
    const newLabel: SubTopicLabel = {
      id: `stl-${Date.now()}`,
      title: `Sub Topic ${labels.length + 1}`,
      startStep: newStart,
      endStep: newStart,
    };
    onLabelsChange([...labels, newLabel]);
  };

  const removeLabel = (id: string) => {
    const idx = labels.findIndex(l => l.id === id);
    const newLabels = labels.filter(l => l.id !== id);
    // Re-cascade after removal
    for (let i = idx; i < newLabels.length; i++) {
      if (i === 0) {
        newLabels[i] = { ...newLabels[i], startStep: 0 };
      } else {
        newLabels[i] = { ...newLabels[i], startStep: newLabels[i - 1].endStep + 1 };
      }
      // Ensure endStep >= startStep
      if (newLabels[i].endStep < newLabels[i].startStep) {
        newLabels[i] = { ...newLabels[i], endStep: newLabels[i].startStep };
      }
    }
    onLabelsChange(newLabels);
  };

  const updateLabelTitle = (id: string, title: string) => {
    onLabelsChange(labels.map(l => l.id === id ? { ...l, title } : l));
  };

  const updateFirstStartStep = (newStart: number) => {
    if (labels.length === 0) return;
    const newLabels = [...labels];
    const clamped = Math.min(newStart, newLabels[0].endStep);
    newLabels[0] = { ...newLabels[0], startStep: clamped };
    onLabelsChange(newLabels);
  };

  const updateEndStep = (id: string, newEnd: number) => {
    const idx = labels.findIndex(l => l.id === id);
    if (idx === -1) return;

    const newLabels = [...labels];
    const computedStart = idx === 0 ? newLabels[0].startStep : newLabels[idx - 1].endStep + 1;
    const clampedEnd = Math.max(computedStart, Math.min(newEnd, steps.length - 1));
    newLabels[idx] = { ...newLabels[idx], startStep: computedStart, endStep: clampedEnd };

    // Cascade subsequent labels
    for (let i = idx + 1; i < newLabels.length; i++) {
      const prevEnd = newLabels[i - 1].endStep;
      const newStart = prevEnd + 1;
      newLabels[i] = { ...newLabels[i], startStep: newStart };
      if (newLabels[i].endStep < newStart) {
        newLabels[i] = { ...newLabels[i], endStep: newStart };
      }
    }

    onLabelsChange(newLabels);
  };

  const getStatus = (label: typeof computedLabels[0], labelIdx: number): 'complete' | 'active' | 'pending' => {
    if (steps.length === 0) return 'pending';
    // Last sub-topic is only complete when ALL animation steps are done
    if (labelIdx === computedLabels.length - 1) {
      if (currentStep >= steps.length - 1) return 'complete';
      if (currentStep >= label.startStep) return 'active';
      return 'pending';
    }
    if (currentStep >= label.endStep) return 'complete';
    if (currentStep >= label.startStep) return 'active';
    return 'pending';
  };

  if (labels.length === 0 && isLocked) return null;

  // Sidebar mode — render as a regular panel, no absolute positioning, no dragging
  if (sidebar) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className={`flex items-center justify-between px-3 py-2.5 ${isLocked ? 'border-b border-indigo-100 bg-gradient-to-r from-indigo-500 to-blue-500' : 'border-b border-indigo-400/15 bg-indigo-500/8'}`}>
          {isLocked ? (
            <span className="text-xs font-semibold text-white">📋 {sidebarTitle}</span>
          ) : (
            <select
              value={sidebarTitle}
              onChange={(e) => onSidebarTitleChange?.(e.target.value)}
              className="text-xs font-semibold text-indigo-300 bg-transparent border-none outline-none cursor-pointer hover:text-indigo-200"
            >
              {SIDEBAR_TITLE_OPTIONS.map(t => (
                <option key={t} value={t} className="bg-[#0a1230] text-slate-300">{t}</option>
              ))}
            </select>
          )}
          {!isLocked && (
            <button
              onClick={addLabel}
              className="p-1 bg-white/20 text-white rounded hover:bg-white/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {labels.length === 0 && !isLocked && (
            <p className="text-[10px] text-slate-500 text-center py-4">Click + to add sub topics</p>
          )}
          {computedLabels.map((label, i) => {
            const status = getStatus(label, i);
            return (
              <div
                key={label.id}
                className={`rounded-lg px-2 py-1.5 transition-all ${
                  status === 'complete' ? 'bg-emerald-500/15 border border-emerald-500/30' :
                  status === 'active' ? 'bg-blue-500/15 border border-blue-500/30' :
                  'bg-slate-800/30 border border-slate-700/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                      status === 'complete' ? 'bg-emerald-500' :
                      status === 'active' ? 'bg-blue-400' :
                      'bg-slate-600'
                    } ${justCompletedId === label.id ? 'celebrate-glow' : ''}`}>
                      {status === 'complete' && <Check className="w-2 h-2 text-white" />}
                    </div>
                    {justCompletedId === label.id && (
                      <div className="absolute inset-0 rounded-full bg-green-400 celebrate-ring" />
                    )}
                  </div>
                  {!isLocked ? (
                    <input
                      value={label.title}
                      onChange={(e) => updateLabelTitle(label.id, e.target.value)}
                      className="text-[10px] font-medium text-slate-300 bg-transparent border-none outline-none flex-1 min-w-0"
                    />
                  ) : (
                    <span className={`text-[10px] font-medium ${
                      status === 'complete' ? 'text-emerald-300' : status === 'active' ? 'text-blue-300' : 'text-slate-500'
                    }`}>{label.title}</span>
                  )}
                  {!isLocked && (
                    <button onClick={() => removeLabel(label.id)} className="p-0.5 hover:bg-red-500/10 rounded">
                      <Trash2 className="w-2.5 h-2.5 text-red-400/50" />
                    </button>
                  )}
                </div>

                {/* Step range — only when unlocked */}
                {!isLocked && (
                  <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                    {i === 0 ? (
                      <>
                        <span className="text-slate-600">Steps</span>
                        <input
                          type="number"
                          value={label.startStep + 1}
                          onChange={(e) => updateFirstStartStep(Math.max(0, Number(e.target.value) - 1))}
                          className="w-7 border border-slate-600/50 rounded px-0.5 py-0.5 text-center text-[9px] bg-slate-800/50 text-slate-300"
                          min={1}
                          max={label.endStep + 1}
                        />
                        <span className="text-slate-600">to</span>
                      </>
                    ) : (
                      <span className="text-slate-600">{label.startStep + 1} to</span>
                    )}
                    <input
                      type="number"
                      value={label.endStep + 1}
                      onChange={(e) => updateEndStep(label.id, Number(e.target.value) - 1)}
                      className="w-7 border border-slate-600/50 rounded px-0.5 py-0.5 text-center text-[9px] bg-slate-800/50 text-slate-300"
                      min={label.startStep + 1}
                      max={steps.length}
                    />
                    <span className="text-slate-600">/{steps.length}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!isLocked && labels.length > 0 && (
          <div className="px-2 py-1.5 border-t border-slate-700/30 text-[9px] text-slate-600 text-center">
            Set step ranges in each sub topic
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`absolute z-40 ${position ? '' : isLocked ? 'top-14 right-3 w-max' : 'top-14 left-3 w-56'}`}
      style={position ? { left: position.x, top: position.y, width: isLocked ? 'max-content' : '14rem' } : undefined}
      onMouseDown={handleMouseDown}
    >
      <div className={`${isLocked ? 'bg-gradient-to-br from-white to-indigo-50' : 'bg-[#0f1b3d]/95'} backdrop-blur-xl rounded-xl ${isLocked ? 'border-2 border-indigo-300 shadow-xl shadow-indigo-100/50' : 'border border-indigo-400/25 shadow-2xl shadow-indigo-500/5'} overflow-hidden`}>
        {/* Header */}
        <div data-drag-handle className={`flex items-center justify-between px-3 py-2.5 cursor-grab active:cursor-grabbing ${isLocked ? 'border-b border-indigo-100 bg-gradient-to-r from-indigo-500 to-blue-500' : 'border-b border-indigo-400/15 bg-indigo-500/8'}`}>
          <span className={`text-xs font-semibold ${isLocked ? 'text-white' : 'text-indigo-300'}`}>
            {isLocked ? '✨ Progress' : 'Sub Topics'}
          </span>
          {!isLocked && (
            <button
              onClick={addLabel}
              className="p-1 bg-white/20 text-white rounded hover:bg-white/30 transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Labels */}
        <div ref={listRef} className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
          {labels.length === 0 && !isLocked && (
            <p className="text-[10px] text-gray-400 text-center py-2">Click + to add sub-topics</p>
          )}

          {computedLabels.map((label, labelIdx) => {
              const status = getStatus(label, labelIdx);

              return (
                <div
                  key={label.id}
                  className={`rounded-lg px-2.5 py-2 transition-colors ${
                    status === 'complete'
                      ? 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-300'
                      : status === 'active'
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300'
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Status dot */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          status === 'complete' ? 'bg-emerald-500' : status === 'active' ? 'bg-blue-500' : 'bg-gray-300'
                        } ${justCompletedId === label.id ? 'celebrate-glow' : ''}`}
                      >
                        {status === 'complete' && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      {/* Ring pulse overlay */}
                      {justCompletedId === label.id && (
                        <div className="absolute inset-0 rounded-full bg-green-400 celebrate-ring" />
                      )}
                    </div>

                    {/* Title */}
                    {!isLocked ? (
                      <input
                        type="text"
                        value={label.title}
                        onChange={(e) => updateLabelTitle(label.id, e.target.value)}
                        className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none flex-1 min-w-0"
                      />
                    ) : (
                      <span className={`text-xs font-medium whitespace-nowrap ${
                        status === 'complete' ? 'text-emerald-700' : status === 'active' ? 'text-blue-700' : 'text-gray-500'
                      }`}>
                        {label.title}
                      </span>
                    )}

                    {!isLocked && (
                      <button onClick={() => removeLabel(label.id)} className="p-0.5 rounded hover:bg-red-100 flex-shrink-0">
                        <Trash2 className="w-2.5 h-2.5 text-red-400" />
                      </button>
                    )}
                  </div>

                  {/* Step range (edit mode) */}
                  {!isLocked && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500">
                      {labelIdx === 0 ? (
                        <>
                          <span className="text-gray-400">Steps</span>
                          <input
                            type="number"
                            value={label.startStep + 1}
                            onChange={(e) => updateFirstStartStep(Math.max(0, Number(e.target.value) - 1))}
                            className="w-8 border border-gray-200 rounded px-1 py-0.5 text-center text-[10px]"
                            min={1}
                            max={label.endStep + 1}
                          />
                          <span className="text-gray-400">to</span>
                        </>
                      ) : (
                        <span className="text-gray-400">Steps {label.startStep + 1} to</span>
                      )}
                      <input
                        type="number"
                        value={label.endStep + 1}
                        onChange={(e) => updateEndStep(label.id, Number(e.target.value) - 1)}
                        className="w-8 border border-gray-200 rounded px-1 py-0.5 text-center text-[10px]"
                        min={label.startStep + 1}
                        max={steps.length}
                      />
                      <span className="text-gray-400">/ {steps.length}</span>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
