/**
 * GlobalAudioTimeline — Audio Sync timeline.
 * Shows virtual topic/subtitle cards + element cards for ALL pages in order.
 * Each card has a duration (how long before next step fires).
 * Topic/subtitle cards: 3s default if animate mode, 0s if preload.
 */

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { Play, Pause, Upload, Trash2, ChevronDown, Minus, Plus } from 'lucide-react';
import type { AnimationStep } from './types';
import type { Editor } from 'tldraw';
import type { DiagramData } from './diagram/diagramTypes';
import { getShapeIcon } from './TimelineBar';

const PAGE_COLORS_HEX = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#f97316', '#6366f1',
];

const DEFAULT_DURATION = 3; // seconds

// A unified step: either a virtual topic/subtitle or a real element step
type UnifiedStep = {
  id: string;
  type: 'topic' | 'subtitle' | 'element';
  pageId: string;
  label: string;
  step?: AnimationStep;
  isPreloaded: boolean;
};

interface GlobalAudioTimelineProps {
  steps: AnimationStep[];
  audioDurations: Record<string, number>;
  onDurationsChange: (durations: Record<string, number>) => void;
  audioFileUrl: string | null;
  onAudioFileChange: (file: File | null) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  editor: Editor | null;
  diagramData?: DiagramData;
  selectedShapeIds: string[];
  pageTopicVisible: Set<string>;
  pageSubtitleVisible: Set<string>;
  pageTopics: Record<string, string>;
  pageSubtitles: Record<string, string>;
  pageTopicModes: Record<string, string>;
  pageSubtitleModes: Record<string, string>;
}

function formatMMSSss(totalSeconds: number): string {
  if (totalSeconds < 0 || isNaN(totalSeconds)) return '00:00:00';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  const sub = Math.round((totalSeconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(sub).padStart(2, '0')}`;
}

function formatShort(seconds: number): string {
  if (seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GlobalAudioTimeline({
  steps,
  audioDurations,
  onDurationsChange,
  audioFileUrl,
  onAudioFileChange,
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  onSeek,
  editor,
  diagramData,
  selectedShapeIds,
  pageTopicVisible,
  pageSubtitleVisible,
  pageTopics,
  pageSubtitles,
  pageTopicModes,
  pageSubtitleModes,
}: GlobalAudioTimelineProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);

  const pages = editor?.getPages() || [];
  const pageIds = pages.map(p => p.id as string);

  // ─── Build unified step list ────────────────────────────────────────────
  const unifiedSteps = useMemo((): UnifiedStep[] => {
    const result: UnifiedStep[] = [];
    const stepsByPage = new Map<string, AnimationStep[]>();
    for (const step of steps) {
      const pid = step.pageId || 'page:page';
      if (!stepsByPage.has(pid)) stepsByPage.set(pid, []);
      stepsByPage.get(pid)!.push(step);
    }

    for (let pi = 0; pi < pageIds.length; pi++) {
      const pid = pageIds[pi];

      // Topic (page 1 only)
      if (pi === 0 && pageTopicVisible.has(pid)) {
        result.push({
          id: `__topic__${pid}`,
          type: 'topic',
          pageId: pid,
          label: pageTopics[pid] || 'Topic',
          isPreloaded: (pageTopicModes[pid] || 'preload') === 'preload',
        });
      }

      // Subtitle (every page)
      if (pageSubtitleVisible.has(pid)) {
        result.push({
          id: `__subtitle__${pid}`,
          type: 'subtitle',
          pageId: pid,
          label: pageSubtitles[pid] || 'Subtitle',
          isPreloaded: (pageSubtitleModes[pid] || 'preload') === 'preload',
        });
      }

      // Element steps
      const pageSteps = stepsByPage.get(pid) || [];
      for (const step of pageSteps) {
        result.push({
          id: step.id,
          type: 'element',
          pageId: pid,
          label: step.label,
          step,
          isPreloaded: step.animation === 'none' && (step.action || 'enter') === 'enter',
        });
      }
    }
    return result;
  }, [steps, pageIds, pageTopicVisible, pageSubtitleVisible, pageTopics, pageSubtitles, pageTopicModes, pageSubtitleModes]);

  // ─── Compute start times ────────────────────────────────────────────────
  const startTimesMap = useMemo(() => {
    const map = new Map<string, number>();
    let cum = 0;
    for (const us of unifiedSteps) {
      map.set(us.id, cum);
      const defaultDur = us.isPreloaded ? 0 : DEFAULT_DURATION;
      cum += audioDurations[us.id] ?? defaultDur;
    }
    return map;
  }, [unifiedSteps, audioDurations]);

  // ─── Duration helpers ───────────────────────────────────────────────────
  const getDuration = useCallback((id: string, isPreloaded: boolean) => {
    return audioDurations[id] ?? (isPreloaded ? 0 : DEFAULT_DURATION);
  }, [audioDurations]);

  const adjustDuration = useCallback((id: string, delta: number, isPreloaded: boolean) => {
    const current = audioDurations[id] ?? (isPreloaded ? 0 : DEFAULT_DURATION);
    onDurationsChange({ ...audioDurations, [id]: Math.max(0, Math.round((current + delta) * 10) / 10) });
  }, [audioDurations, onDurationsChange]);

  // ─── Reset ──────────────────────────────────────────────────────────────
  const resetDefaults = useCallback(() => {
    const newDur: Record<string, number> = {};
    for (const us of unifiedSteps) {
      newDur[us.id] = us.isPreloaded ? 0 : DEFAULT_DURATION;
    }
    onDurationsChange(newDur);
  }, [unifiedSteps, onDurationsChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAudioFileChange(file);
    e.target.value = '';
  }, [onAudioFileChange]);

  // ─── Per-card audio preview (independent of global audio) ───────────────
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewEndTimeRef = useRef<number>(0);
  const [previewingStepId, setPreviewingStepId] = useState<string | null>(null);

  // Create persistent preview audio element once when audioFileUrl is available
  // Use Blob URL for reliable seeking (range request issues with dev server)
  const previewBlobUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!audioFileUrl) { previewBlobUrlRef.current = null; previewAudioRef.current = null; return; }
    let cancelled = false;
    fetch(audioFileUrl)
      .then(r => r.blob())
      .then(blob => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        previewBlobUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = 'auto';
        previewAudioRef.current = audio;

        const handleTimeUpdate = () => {
          if (previewEndTimeRef.current > 0 && audio.currentTime >= previewEndTimeRef.current) {
            audio.pause();
            previewEndTimeRef.current = 0;
            setPreviewingStepId(null);
          }
        };
        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('ended', () => { previewEndTimeRef.current = 0; setPreviewingStepId(null); });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
        previewAudioRef.current = null;
      }
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
      previewAudioRef.current = null;
    };
  }, [audioFileUrl]);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    previewEndTimeRef.current = 0;
    setPreviewingStepId(null);
  }, []);

  const playCardPreview = useCallback((id: string) => {
    const audio = previewAudioRef.current;
    if (!audio || !audioFileUrl) return;

    const start = startTimesMap.get(id) ?? 0;
    const isPreloaded = unifiedSteps.find(s => s.id === id)?.isPreloaded ?? false;
    const dur = audioDurations[id] ?? (isPreloaded ? 0.5 : 3);

    audio.pause();
    audio.currentTime = start;
    previewEndTimeRef.current = start + dur;
    setPreviewingStepId(id);
    audio.play().catch(() => {});
  }, [audioFileUrl, startTimesMap, audioDurations, unifiedSteps]);

  // ─── Track page boundaries for separators ───────────────────────────────
  let lastPageId = '';

  return (
    <div className="flex-shrink-0 bg-[#0a0a14] border-t border-[#1a1a2e]">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div data-drag-handle className="flex items-center justify-between px-3 py-1.5 border-b border-[#1a1a2e] cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-orange-400/80 uppercase tracking-wider font-bold">Audio Sync</span>
          <span className="text-[10px] text-slate-600">{unifiedSteps.length} items · {pages.length} pages</span>
          {duration > 0 && <span className="text-[10px] text-slate-600">· {formatShort(duration)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {!audioFileUrl ? (
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/10">
              <Upload className="w-3 h-3" /> Upload Audio
            </button>
          ) : (
            <>
              <button
                onClick={() => { onSeek(0); if (!isPlaying) onPlayPause(); }}
                className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border transition-all ${isPlaying ? 'text-blue-300 border-blue-500/30 bg-blue-500/10' : 'text-slate-400 border-[#2a2a4e] hover:text-blue-300 hover:border-blue-500/30'}`}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              <span className="text-[10px] text-slate-400 font-mono">{formatMMSSss(currentTime)}</span>
              <button onClick={resetDefaults} className="text-[9px] text-slate-500 hover:text-blue-400 px-1.5 py-0.5 rounded border border-[#2a2a4e] hover:border-blue-500/30 transition-colors">Reset</button>
              <button onClick={() => onAudioFileChange(null)} className="text-slate-600 hover:text-red-400 transition-colors" title="Remove audio"><Trash2 className="w-3 h-3" /></button>
            </>
          )}
          <button onClick={() => setMinimized(m => !m)} className="p-0.5 rounded hover:bg-[#12121f] text-slate-500 hover:text-blue-300">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${minimized ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Cards track ────────────────────────────────────────────────── */}
      {!minimized && (
        <div className="flex items-stretch gap-0 px-3 py-2 overflow-x-auto" style={{ minHeight: 90, overscrollBehavior: 'contain' }}>
          {unifiedSteps.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] text-slate-600">No steps or topics/subtitles</p>
            </div>
          ) : (
            <>
              {unifiedSteps.map((us, idx) => {
                const pid = us.pageId;
                const pageIdx = pageIds.indexOf(pid);
                const pageColor = PAGE_COLORS_HEX[Math.max(0, pageIdx) % PAGE_COLORS_HEX.length];
                const isHovered = hoveredStepId === us.id;
                const stepDuration = getDuration(us.id, us.isPreloaded);
                const stepStart = startTimesMap.get(us.id) ?? 0;
                const stepEnd = stepStart + stepDuration;
                const isActive = audioFileUrl && currentTime >= stepStart && currentTime < stepEnd && stepDuration > 0;
                const displayNum = idx + 1;

                // Page separator
                const showSep = pid !== lastPageId && lastPageId !== '' && pageIds.length > 1;
                lastPageId = pid;

                // Card styling by type
                const isVirtual = us.type === 'topic' || us.type === 'subtitle';
                const virtualBorderColor = us.type === 'topic' ? 'border-rose-500/40' : 'border-teal-500/40';
                const virtualBgColor = us.type === 'topic' ? 'bg-rose-500/5' : 'bg-teal-500/5';
                const virtualTextColor = us.type === 'topic' ? 'text-rose-300' : 'text-teal-300';
                const virtualIcon = us.type === 'topic' ? '📌' : '📋';

                // For element cards
                let info = { icon: null as React.ReactNode, label: us.label };
                let extra = '';
                let isSelected = false;
                let isManualCard = false;
                if (us.step) {
                  info = getShapeIcon(editor, us.step.shapeIds[0], diagramData);
                  extra = us.step.shapeIds.length > 1 ? `+${us.step.shapeIds.length - 1}` : '';
                  isSelected = us.step.shapeIds.some(id => selectedShapeIds.includes(id));
                  const action = us.step.action || 'enter';
                  isManualCard = action === 'exit' || action === 'move' || action === 'teleport' || action === 'swap';
                }

                return (
                  <div key={us.id} className="flex items-stretch">
                    {showSep && (
                      <div className="flex-shrink-0 w-[3px] mx-1.5 self-stretch rounded-full" style={{ backgroundColor: `${pageColor}40` }} />
                    )}
                    <div
                      onMouseEnter={() => setHoveredStepId(us.id)}
                      onMouseLeave={() => setHoveredStepId(null)}
                      className={`flex-shrink-0 w-44 rounded-lg border flex flex-col overflow-hidden transition-all mx-1 ${
                        isActive
                          ? 'border-blue-400/60 bg-blue-500/8 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                          : isHovered
                          ? 'border-blue-400/50 shadow-[0_0_8px_rgba(59,130,246,0.1)]'
                          : isVirtual
                          ? `${virtualBorderColor} ${virtualBgColor}`
                          : isSelected
                          ? 'border-amber-400/50 bg-amber-500/8'
                          : isManualCard
                          ? 'border-orange-500/30 bg-orange-500/5'
                          : 'border-[#2a2a4e] bg-[#12121f] hover:border-blue-500/30'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a1a2e] bg-[#0d0d18]">
                        <span className="text-[9px] font-bold text-slate-500">{String(displayNum).padStart(2, '0')}</span>
                        {us.isPreloaded && <span className="text-[7px] text-slate-600">⚡</span>}
                        {isVirtual ? (
                          <>
                            <span className="text-[10px]">{virtualIcon}</span>
                            <span className={`text-[10px] font-medium truncate flex-1 ${virtualTextColor}`}>{us.label}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400">{info.icon}</span>
                            <span className="text-[10px] font-medium text-slate-300 truncate flex-1">{info.label}</span>
                            {extra && <span className="text-[8px] text-slate-500">{extra}</span>}
                          </>
                        )}
                        {pageIds.length > 1 && (
                          <span className="text-[7px] font-bold px-1 rounded-full" style={{ backgroundColor: `${pageColor}20`, color: pageColor }}>
                            {pages[pageIdx]?.name || `P${pageIdx + 1}`}
                          </span>
                        )}
                      </div>

                      {/* Play + Duration control */}
                      <div className="px-2 py-2 flex items-center gap-1.5">
                        {audioFileUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (previewingStepId === us.id) {
                                stopPreview();
                              } else {
                                playCardPreview(us.id);
                              }
                            }}
                            className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 transition-all ${
                              previewingStepId === us.id
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-blue-300 hover:border-blue-500/30'
                            }`}
                            title={previewingStepId === us.id ? 'Stop' : `Play from ${formatMMSSss(stepStart)}`}
                          >
                            {previewingStepId === us.id ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
                          </button>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); adjustDuration(us.id, -0.5, us.isPreloaded); }}
                          className="flex items-center justify-center w-5 h-5 rounded bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-blue-300 hover:border-blue-500/30 transition-all flex-shrink-0"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>

                        <span className={`text-[9px] font-mono min-w-[62px] text-center select-none ${stepDuration === 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                          {formatMMSSss(stepDuration)}
                        </span>

                        <button
                          onClick={(e) => { e.stopPropagation(); adjustDuration(us.id, 0.5, us.isPreloaded); }}
                          className="flex items-center justify-center w-5 h-5 rounded bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-blue-300 hover:border-blue-500/30 transition-all flex-shrink-0"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} style={{ display: 'none' }} />
    </div>
  );
}
