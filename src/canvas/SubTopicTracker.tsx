import { useCallback, useRef, useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { playSuccessSound, celebrateAllComplete } from './celebration';
import type { SubTopicLabel, AnimationStep } from './types';
import type { Editor } from 'tldraw';

// ─── Feature flags ───────────────────────────────────────────────────────────
const ENABLE_COMPLETION_SOUND = false;
const ENABLE_PARTY_POPPER = false;
// ─────────────────────────────────────────────────────────────────────────────

interface SubTopicTrackerProps {
  labels: SubTopicLabel[];
  onLabelsChange: (labels: SubTopicLabel[]) => void;
  steps: AnimationStep[];
  isLocked: boolean;
  currentStep: number;
  editor?: Editor | null;
  sidebar?: boolean;
  sidebarTitle?: string;
  onSidebarTitleChange?: (title: string) => void;
}

const SIDEBAR_TITLE_OPTIONS = ['Outline', 'Scenes', 'Topics', 'Contents', 'Agenda', 'Chapter Breakdown', 'Progress'];

// ─── Helper: get ordered page IDs from steps ─────────────────────────────────
function getOrderedPageIds(steps: AnimationStep[], editor?: Editor | null): string[] {
  if (editor) {
    return editor.getPages().map(p => p.id as string);
  }
  // Fallback: extract unique page IDs from steps in order
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const s of steps) {
    const pid = s.pageId || 'page:page';
    if (!seen.has(pid)) { seen.add(pid); ordered.push(pid); }
  }
  return ordered;
}

function getPageName(pageId: string | undefined, editor?: Editor | null, pageIndex?: number): string {
  if (!pageId) return `Page ${(pageIndex ?? 0) + 1}`;
  if (editor) {
    try {
      const page = editor.getPage(pageId as any);
      if (page) return page.name || `Page ${(pageIndex ?? 0) + 1}`;
    } catch { /* page not found */ }
  }
  return `Page ${(pageIndex ?? 0) + 1}`;
}

export default function SubTopicTracker({
  labels, onLabelsChange, steps, isLocked, currentStep, editor,
  sidebar, sidebarTitle = 'Outline', onSidebarTitleChange,
}: SubTopicTrackerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const target = e.target as HTMLElement;
    if (!target.closest('[data-drag-handle]')) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const parentRect = containerRef.current.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left - parentRect.left, origY: rect.top - parentRect.top };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPosition({ x: dragRef.current.origX + (ev.clientX - dragRef.current.startX), y: dragRef.current.origY + (ev.clientY - dragRef.current.startY) });
    };
    const handleMouseUp = () => { dragRef.current = null; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // ─── Page info ──────────────────────────────────────────────────────────
  const pageIds = getOrderedPageIds(steps, editor);
  const totalPages = pageIds.length;

  // Compute which page index the current step belongs to
  const currentStepPageId = currentStep >= 0 && currentStep < steps.length
    ? (steps[currentStep].pageId || 'page:page')
    : '';
  const currentPageIndex = pageIds.indexOf(currentStepPageId);

  // Check if all steps of a page are complete (currentStep is at or past the last step of that page)
  const getLastStepIndexForPage = useCallback((pageIndex: number): number => {
    const pid = pageIds[pageIndex];
    if (!pid) return -1;
    let lastIdx = -1;
    for (let i = 0; i < steps.length; i++) {
      if ((steps[i].pageId || 'page:page') === pid) lastIdx = i;
    }
    return lastIdx;
  }, [steps, pageIds]);

  // ─── Progress calculation ───────────────────────────────────────────────
  const getProgress = useCallback((label: SubTopicLabel, labelIdx: number): number => {
    if (steps.length === 0 || totalPages === 0) return 0;
    const startPageIdx = label.startPage ?? (labelIdx === 0 ? 0 : (labels[labelIdx - 1].endPage ?? 0) + 1);
    const endPageIdx = label.endPage ?? label.endStep ?? 0;

    // Count total steps and completed steps within this label's page range
    let totalStepsInRange = 0;
    let completedSteps = 0;

    for (let pi = startPageIdx; pi <= endPageIdx && pi < pageIds.length; pi++) {
      const pid = pageIds[pi];
      for (let si = 0; si < steps.length; si++) {
        if ((steps[si].pageId || 'page:page') === pid) {
          totalStepsInRange++;
          if (currentStep >= si) completedSteps++;
        }
      }
    }

    if (totalStepsInRange === 0) return 0;
    return Math.min(1, completedSteps / totalStepsInRange);
  }, [steps, pageIds, currentStep, totalPages, labels]);

  // ─── Completion detection ───────────────────────────────────────────────
  const prevStepRef = useRef(currentStep);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLocked) return;
    if (currentStep <= prevStepRef.current) { prevStepRef.current = currentStep; return; }

    for (const label of labels) {
      const endPageIdx = label.endPage ?? label.endStep ?? 0;
      const lastStepOfEndPage = getLastStepIndexForPage(endPageIdx);
      if (currentStep === lastStepOfEndPage && prevStepRef.current < lastStepOfEndPage) {
        if (ENABLE_COMPLETION_SOUND) playSuccessSound();
        setJustCompletedId(label.id);
        setTimeout(() => setJustCompletedId(null), 900);
        break;
      }
    }

    // Final celebration
    if (currentStep === steps.length - 1 && prevStepRef.current < steps.length - 1) {
      if (ENABLE_PARTY_POPPER) setTimeout(() => celebrateAllComplete(), 1500);
      if (labels.length > 0) {
        setJustCompletedId(labels[labels.length - 1].id);
        setTimeout(() => setJustCompletedId(null), 900);
      }
    }
    prevStepRef.current = currentStep;
  }, [currentStep, isLocked, labels, steps, getLastStepIndexForPage]);

  // Auto-scroll
  useEffect(() => {
    if (!isLocked || !listRef.current) return;
    let activeIdx = -1;
    for (let i = 0; i < labels.length; i++) {
      const startPageIdx = labels[i].startPage ?? (i === 0 ? 0 : (labels[i - 1].endPage ?? labels[i - 1].endStep ?? 0) + 1);
      const endPageIdx = labels[i].endPage ?? labels[i].endStep ?? 0;
      if (currentPageIndex >= startPageIdx && currentPageIndex <= endPageIdx) activeIdx = i;
      else if (currentPageIndex > endPageIdx) activeIdx = i;
    }
    if (activeIdx >= 0) {
      const items = listRef.current.children;
      if (activeIdx >= items.length - 2) {
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      } else {
        const target = Math.min(activeIdx + 2, items.length - 1);
        if (items[target]) (items[target] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'end' });
        setTimeout(() => { if (items[activeIdx]) (items[activeIdx] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
      }
    } else if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep, isLocked, labels, currentPageIndex]);

  // ─── CRUD ───────────────────────────────────────────────────────────────
  const addLabel = () => {
    const lastEnd = labels.length > 0 ? (labels[labels.length - 1].endPage ?? labels[labels.length - 1].endStep ?? 0) : -1;
    const newStart = lastEnd + 1;
    const newLabel: SubTopicLabel = {
      id: `stl-${Date.now()}`,
      title: `Sub Topic ${labels.length + 1}`,
      startStep: 0,
      endStep: 0,
      startPage: newStart,
      endPage: Math.min(newStart, totalPages - 1),
    };
    onLabelsChange([...labels, newLabel]);
  };

  const removeLabel = (id: string) => {
    const idx = labels.findIndex(l => l.id === id);
    const newLabels = labels.filter(l => l.id !== id);
    // Re-cascade
    for (let i = idx; i < newLabels.length; i++) {
      if (i === 0) {
        newLabels[i] = { ...newLabels[i], startPage: 0 };
      } else {
        newLabels[i] = { ...newLabels[i], startPage: (newLabels[i - 1].endPage ?? 0) + 1 };
      }
      if ((newLabels[i].endPage ?? 0) < (newLabels[i].startPage ?? 0)) {
        newLabels[i] = { ...newLabels[i], endPage: newLabels[i].startPage };
      }
    }
    onLabelsChange(newLabels);
  };

  const updateLabelTitle = (id: string, title: string) => {
    onLabelsChange(labels.map(l => l.id === id ? { ...l, title } : l));
  };

  const updateEndPage = (id: string, newEnd: number) => {
    const idx = labels.findIndex(l => l.id === id);
    if (idx === -1) return;
    const newLabels = [...labels];
    const computedStart = idx === 0 ? (newLabels[0].startPage ?? 0) : (newLabels[idx - 1].endPage ?? 0) + 1;
    const clampedEnd = Math.max(computedStart, Math.min(newEnd, totalPages - 1));
    newLabels[idx] = { ...newLabels[idx], startPage: computedStart, endPage: clampedEnd };
    // Cascade
    for (let i = idx + 1; i < newLabels.length; i++) {
      const prevEnd = newLabels[i - 1].endPage ?? 0;
      const newStart = prevEnd + 1;
      newLabels[i] = { ...newLabels[i], startPage: newStart };
      if ((newLabels[i].endPage ?? 0) < newStart) {
        newLabels[i] = { ...newLabels[i], endPage: newStart };
      }
    }
    onLabelsChange(newLabels);
  };

  const updateFirstStartPage = (newStart: number) => {
    if (labels.length === 0) return;
    const newLabels = [...labels];
    const clamped = Math.min(newStart, newLabels[0].endPage ?? 0);
    newLabels[0] = { ...newLabels[0], startPage: clamped };
    onLabelsChange(newLabels);
  };

  // ─── Status ─────────────────────────────────────────────────────────────
  const getStatus = (label: SubTopicLabel, labelIdx: number): 'complete' | 'active' | 'pending' => {
    if (steps.length === 0 || totalPages === 0) return 'pending';
    const startPageIdx = label.startPage ?? (labelIdx === 0 ? 0 : (labels[labelIdx - 1].endPage ?? 0) + 1);
    const endPageIdx = label.endPage ?? label.endStep ?? 0;

    // Last sub-topic is complete only when ALL steps are done
    if (labelIdx === labels.length - 1) {
      if (currentStep >= steps.length - 1) return 'complete';
    } else {
      // Complete when all steps of the end page are done
      const lastStepOfEndPage = getLastStepIndexForPage(endPageIdx);
      if (lastStepOfEndPage >= 0 && currentStep >= lastStepOfEndPage) return 'complete';
    }

    // Active if current page is within this label's range
    if (currentPageIndex >= startPageIdx && currentPageIndex <= endPageIdx) return 'active';
    if (currentPageIndex > endPageIdx) return 'complete';
    return 'pending';
  };

  // Computed labels with cascaded startPage
  const computedLabels = labels.map((label, idx) => {
    if (idx === 0) return label;
    const prevEnd = labels[idx - 1].endPage ?? labels[idx - 1].endStep ?? 0;
    return { ...label, startPage: prevEnd + 1 };
  });

  if (labels.length === 0 && isLocked) return null;

  // ─── Sidebar mode ───────────────────────────────────────────────────────
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
            <button onClick={addLabel} className="p-1 bg-white/20 text-white rounded hover:bg-white/30 transition-colors">
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
            const startP = label.startPage ?? 0;
            const endP = label.endPage ?? label.endStep ?? 0;
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

                {/* Page range — only when unlocked */}
                {!isLocked && (
                  <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                    {i === 0 ? (
                      <>
                        <span className="text-slate-600">Pages</span>
                        <input
                          type="number"
                          value={startP + 1}
                          onChange={(e) => updateFirstStartPage(Math.max(0, Number(e.target.value) - 1))}
                          className="w-7 border border-slate-600/50 rounded px-0.5 py-0.5 text-center text-[9px] bg-slate-800/50 text-slate-300"
                          min={1}
                          max={endP + 1}
                        />
                        <span className="text-slate-600">to</span>
                      </>
                    ) : (
                      <span className="text-slate-600">P{startP + 1} to</span>
                    )}
                    <input
                      type="number"
                      value={endP + 1}
                      onChange={(e) => updateEndPage(label.id, Number(e.target.value) - 1)}
                      className="w-7 border border-slate-600/50 rounded px-0.5 py-0.5 text-center text-[9px] bg-slate-800/50 text-slate-300"
                      min={startP + 1}
                      max={totalPages}
                    />
                    <span className="text-slate-600">/{totalPages} pages</span>
                  </div>
                )}

                {/* Page names in locked mode */}
                {isLocked && totalPages > 1 && (
                  <div className="mt-0.5 text-[8px] text-slate-600">
                    {getPageName(pageIds[startP], editor, startP)}
                    {startP !== endP && ` → ${getPageName(pageIds[endP], editor, endP)}`}
                  </div>
                )}

                {/* Progress bar */}
                {isLocked && (
                  <div className="mt-1.5 w-full h-[3px] rounded-full bg-slate-700/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        status === 'complete'
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                          : status === 'active'
                          ? 'bg-blue-400 shadow-[0_0_4px_rgba(96,165,250,0.4)]'
                          : 'bg-slate-600'
                      }`}
                      style={{ width: `${Math.round(getProgress(label, i) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!isLocked && labels.length > 0 && (
          <div className="px-2 py-1.5 border-t border-slate-700/30 text-[9px] text-slate-600 text-center">
            Set page ranges for each sub topic
          </div>
        )}
      </div>
    );
  }

  // ─── Floating mode ──────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`absolute z-40 ${position ? '' : isLocked ? 'top-14 right-3 w-max' : 'top-14 left-3 w-56'}`}
      style={position ? { left: position.x, top: position.y, width: isLocked ? 'max-content' : '14rem' } : undefined}
      onMouseDown={handleMouseDown}
    >
      <div className={`${isLocked ? 'bg-gradient-to-br from-white to-indigo-50' : 'bg-[#0f1b3d]/95'} backdrop-blur-xl rounded-xl ${isLocked ? 'border-2 border-indigo-300 shadow-xl shadow-indigo-100/50' : 'border border-indigo-400/25 shadow-2xl shadow-indigo-500/5'} overflow-hidden`}>
        <div data-drag-handle className={`flex items-center justify-between px-3 py-2.5 cursor-grab active:cursor-grabbing ${isLocked ? 'border-b border-indigo-100 bg-gradient-to-r from-indigo-500 to-blue-500' : 'border-b border-indigo-400/15 bg-indigo-500/8'}`}>
          <span className={`text-xs font-semibold ${isLocked ? 'text-white' : 'text-indigo-300'}`}>
            {isLocked ? '✨ Progress' : 'Sub Topics'}
          </span>
          {!isLocked && (
            <button onClick={addLabel} className="p-1 bg-white/20 text-white rounded hover:bg-white/30 transition-colors">
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>

        <div ref={listRef} className="p-2 space-y-1.5 max-h-[300px] overflow-y-auto">
          {labels.length === 0 && !isLocked && (
            <p className="text-[10px] text-gray-400 text-center py-2">Click + to add sub-topics</p>
          )}
          {computedLabels.map((label, i) => {
            const status = getStatus(label, i);
            const startP = label.startPage ?? 0;
            const endP = label.endPage ?? label.endStep ?? 0;
            return (
              <div
                key={label.id}
                className={`rounded-lg px-2.5 py-2 transition-colors ${
                  status === 'complete' ? 'bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-300' :
                  status === 'active' ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300' :
                  'bg-white border border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="relative flex-shrink-0">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      status === 'complete' ? 'bg-emerald-500' : status === 'active' ? 'bg-blue-500' : 'bg-gray-300'
                    } ${justCompletedId === label.id ? 'celebrate-glow' : ''}`}>
                      {status === 'complete' && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {justCompletedId === label.id && (
                      <div className="absolute inset-0 rounded-full bg-green-400 celebrate-ring" />
                    )}
                  </div>
                  {!isLocked ? (
                    <input type="text" value={label.title} onChange={(e) => updateLabelTitle(label.id, e.target.value)}
                      className="text-xs font-medium text-gray-700 bg-transparent border-none outline-none flex-1 min-w-0" />
                  ) : (
                    <span className={`text-xs font-medium whitespace-nowrap ${
                      status === 'complete' ? 'text-emerald-700' : status === 'active' ? 'text-blue-700' : 'text-gray-500'
                    }`}>{label.title}</span>
                  )}
                  {!isLocked && (
                    <button onClick={() => removeLabel(label.id)} className="p-0.5 rounded hover:bg-red-100 flex-shrink-0">
                      <Trash2 className="w-2.5 h-2.5 text-red-400" />
                    </button>
                  )}
                </div>
                {!isLocked && (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500">
                    {i === 0 ? (
                      <>
                        <span className="text-gray-400">Pages</span>
                        <input type="number" value={startP + 1}
                          onChange={(e) => updateFirstStartPage(Math.max(0, Number(e.target.value) - 1))}
                          className="w-8 border border-gray-200 rounded px-1 py-0.5 text-center text-[10px]"
                          min={1} max={endP + 1} />
                        <span className="text-gray-400">to</span>
                      </>
                    ) : (
                      <span className="text-gray-400">P{startP + 1} to</span>
                    )}
                    <input type="number" value={endP + 1}
                      onChange={(e) => updateEndPage(label.id, Number(e.target.value) - 1)}
                      className="w-8 border border-gray-200 rounded px-1 py-0.5 text-center text-[10px]"
                      min={startP + 1} max={totalPages} />
                    <span className="text-gray-400">/{totalPages} pages</span>
                  </div>
                )}

                {/* Progress bar (floating mode) */}
                {isLocked && (
                  <div className="mt-1.5 w-full h-[3px] rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        status === 'complete'
                          ? 'bg-emerald-500 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                          : status === 'active'
                          ? 'bg-blue-500 shadow-[0_0_4px_rgba(59,130,246,0.4)]'
                          : 'bg-gray-300'
                      }`}
                      style={{ width: `${Math.round(getProgress(label, i) * 100)}%` }}
                    />
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
