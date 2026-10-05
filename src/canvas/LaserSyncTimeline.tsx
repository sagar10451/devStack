/**
 * LaserSyncTimeline — Timeline for managing recorded laser strokes.
 * Each card has a start time (when the stroke begins during audio).
 * Animation speed comes from recorded per-point timestamps — not editable.
 * +/− adjusts start time. Cascade: increase pushes subsequent cards forward,
 * decrease pulls them back by the same delta. Floor: card N >= card N-1.
 * Default gap between cards: 3 seconds.
 */

import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { Play, Pause, Trash2, ChevronDown, Minus, Plus, Upload } from 'lucide-react';
import type { LaserStroke } from './types';
import type { Editor } from 'tldraw';

const PAGE_COLORS_HEX = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4', '#f97316', '#6366f1',
];

const DEFAULT_GAP = 1; // seconds between cards by default

/* ── helpers ─────────────────────────────────────────────────────────────── */

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

/** Get recorded draw duration in seconds from a stroke's per-point timestamps.
 *  Falls back to a rough estimate if timestamps are missing (old data). */
function getRecordedDuration(stroke: LaserStroke): number {
  if (stroke.path.length < 2) return 0;
  const lastT = stroke.path[stroke.path.length - 1].t;
  if (lastT != null && lastT > 0) return lastT / 1000;
  // Fallback for old strokes without timestamps: ~50ms per point
  return (stroke.path.length * 50) / 1000;
}

/* ── Mini SVG preview ────────────────────────────────────────────────────── */

function StrokePreview({ path, color }: { path: { x: number; y: number }[]; color: string }) {
  if (path.length < 2) return <div className="w-10 h-8 bg-white/5 rounded" />;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const pad = 2;
  const svgW = 40;
  const svgH = 28;
  const scale = Math.min((svgW - pad * 2) / w, (svgH - pad * 2) / h);
  const points = path.map(p => `${pad + (p.x - minX) * scale},${pad + (p.y - minY) * scale}`).join(' ');

  return (
    <svg width={svgW} height={svgH} className="flex-shrink-0 rounded bg-white/5">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

/* ── Props ────────────────────────────────────────────────────────────────── */

interface LaserSyncTimelineProps {
  strokes: Record<string, LaserStroke[]>;
  onStrokesChange: (strokes: Record<string, LaserStroke[]>) => void;
  /** strokeId → absolute audio time in seconds when this stroke should start */
  timings: Record<string, number>;
  onTimingsChange: (timings: Record<string, number>) => void;
  editor: Editor | null;
  /** Current page ID — timeline shows only this page's strokes */
  currentPageId: string;
  /** Current camera group index — filters strokes to this group */
  currentCameraGroupIdx: number;
  /** Last stroke time from previous pages (for default timing on page 2+) */
  prevPageLastStrokeTime: number;
  /* Audio — reuses the same global audio as Audio Sync */
  audioFileUrl: string | null;
  onAudioFileChange: (file: File | null) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function LaserSyncTimeline({
  strokes,
  onStrokesChange,
  timings,
  onTimingsChange,
  editor,
  currentPageId,
  currentCameraGroupIdx,
  prevPageLastStrokeTime,
  audioFileUrl,
  onAudioFileChange,
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  onSeek,
}: LaserSyncTimelineProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);
  const previewAnimRef = useRef<number>(0);

  // Ordered page list
  const pages = editor?.getPages() || [];
  const pageIds = pages.map(p => p.id as string);

  // ─── Current page + current camera group strokes ────────────────────────
  const currentPageStrokes = useMemo(() => {
    const pageStrokes = strokes[currentPageId] || [];
    if (currentCameraGroupIdx < 0) return pageStrokes;
    return pageStrokes.filter(s =>
      s.cameraGroupIdx === currentCameraGroupIdx ||
      (s.cameraGroupIdx == null && currentCameraGroupIdx === 0)
    );
  }, [strokes, currentPageId, currentCameraGroupIdx]);

  // ─── Get start time for a stroke (absolute audio time) ─────────────────
  const getStartTime = useCallback((id: string, localIdx: number): number => {
    const raw = timings[id];
    if (raw != null && typeof raw === 'number') return raw;
    const baseTime = localIdx === 0 ? prevPageLastStrokeTime : 0;
    if (localIdx === 0) return baseTime;
    const prevStroke = currentPageStrokes[localIdx - 1];
    if (prevStroke) {
      const prevTime = timings[prevStroke.id];
      if (typeof prevTime === 'number') return prevTime + DEFAULT_GAP;
    }
    return baseTime + localIdx * DEFAULT_GAP;
  }, [timings, prevPageLastStrokeTime, currentPageStrokes]);

  const totalStrokes = currentPageStrokes.length;
  const currentPageIdx = pageIds.indexOf(currentPageId);
  const currentPageName = (currentPageIdx >= 0 ? pages[currentPageIdx]?.name : null) || 'Page';

  // ─── Adjust start time with cascade logic (operates within current group) ──
  const adjustStartTime = useCallback((localIdx: number, delta: number) => {
    const stroke = currentPageStrokes[localIdx];
    if (!stroke) return;
    const strokeId = stroke.id;
    const currentStart = getStartTime(strokeId, localIdx);
    let newStart = Math.round((currentStart + delta) * 10) / 10;

    // Floor: first stroke >= 0, others >= previous stroke's start
    if (localIdx === 0) {
      newStart = Math.max(0, newStart);
    } else {
      const prevId = currentPageStrokes[localIdx - 1].id;
      const prevStart = getStartTime(prevId, localIdx - 1);
      newStart = Math.max(prevStart, newStart);
    }

    const newTimings = { ...timings };
    const oldStart = getStartTime(strokeId, localIdx);
    newTimings[strokeId] = newStart;

    if (delta > 0) {
      // Push subsequent cards in this group forward
      for (let i = localIdx + 1; i < currentPageStrokes.length; i++) {
        const nextId = currentPageStrokes[i].id;
        const prevId = currentPageStrokes[i - 1].id;
        const prevCardStart = newTimings[prevId] ?? getStartTime(prevId, i - 1);
        const nextCurrentStart = newTimings[nextId] ?? getStartTime(nextId, i);
        if (prevCardStart + DEFAULT_GAP > nextCurrentStart) {
          newTimings[nextId] = Math.round((prevCardStart + DEFAULT_GAP) * 10) / 10;
        } else {
          break;
        }
      }
    } else if (delta < 0) {
      // Pull subsequent cards back by the same delta
      const shift = newStart - oldStart;
      for (let i = localIdx + 1; i < currentPageStrokes.length; i++) {
        const nextId = currentPageStrokes[i].id;
        const nextCurrentStart = newTimings[nextId] ?? getStartTime(nextId, i);
        const shifted = Math.round((nextCurrentStart + shift) * 10) / 10;
        const prevId = currentPageStrokes[i - 1].id;
        const prevCardStart = newTimings[prevId] ?? getStartTime(prevId, i - 1);
        newTimings[nextId] = Math.max(prevCardStart, shifted);
      }
    }

    onTimingsChange(newTimings);
  }, [currentPageStrokes, timings, getStartTime, onTimingsChange]);

  // ─── Reset: clear strokes and timings for CURRENT PAGE only ──────────────
  const resetAll = useCallback(() => {
    // Remove only current page's strokes
    const newStrokes = { ...strokes };
    const pageStrokes = newStrokes[currentPageId] || [];
    delete newStrokes[currentPageId];
    onStrokesChange(newStrokes);
    // Remove timings for the deleted strokes
    const newTimings = { ...timings };
    for (const s of pageStrokes) {
      delete newTimings[s.id];
    }
    onTimingsChange(newTimings);
  }, [strokes, currentPageId, onStrokesChange, timings, onTimingsChange]);

  // ─── Delete stroke (from current page) ───────────────────────────────────
  const deleteStroke = useCallback((strokeId: string) => {
    const pageStrokes = strokes[currentPageId] || [];
    const updated = pageStrokes.filter(s => s.id !== strokeId);
    const newStrokes = { ...strokes };
    if (updated.length === 0) {
      delete newStrokes[currentPageId];
    } else {
      newStrokes[currentPageId] = updated;
    }
    onStrokesChange(newStrokes);
    const newTimings = { ...timings };
    delete newTimings[strokeId];
    onTimingsChange(newTimings);
  }, [strokes, currentPageId, onStrokesChange, timings, onTimingsChange]);

  // ─── Audio file upload ──────────────────────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAudioFileChange(file);
    e.target.value = '';
  }, [onAudioFileChange]);

  // ─── Per-card audio preview ─────────────────────────────────────────────
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewEndTimeRef = useRef<number>(0);
  const [previewingStepId, setPreviewingStepId] = useState<string | null>(null);

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
    };
  }, [audioFileUrl]);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) previewAudioRef.current.pause();
    previewEndTimeRef.current = 0;
    setPreviewingStepId(null);
    cancelAnimationFrame(previewAnimRef.current);
    setPreviewingId(null);
    const canvas = document.querySelector('.laser-preview-canvas') as HTMLCanvasElement;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  /** Play audio + draw stroke visually in sync for a single card */
  const playCardPreview = useCallback((id: string, stroke: LaserStroke, idx: number) => {
    // Stop any running preview
    if (previewAudioRef.current) previewAudioRef.current.pause();
    cancelAnimationFrame(previewAnimRef.current);
    previewEndTimeRef.current = 0;

    // Toggle off if clicking same card
    if (previewingStepId === id) {
      setPreviewingStepId(null);
      setPreviewingId(null);
      const canvas = document.querySelector('.laser-preview-canvas') as HTMLCanvasElement;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const audio = previewAudioRef.current;
    const cardStart = getStartTime(id, idx);
    const path = stroke.path;
    const hasTimestamps = path.length > 1 && path[path.length - 1].t > 0;
    const recordedDurMs = hasTimestamps ? path[path.length - 1].t : path.length * 50;
    const recordedDurSec = recordedDurMs / 1000;

    setPreviewingStepId(id);
    setPreviewingId(id);

    // Start audio from absolute time (cardStart IS the absolute time now)
    if (audio && audioFileUrl) {
      audio.currentTime = cardStart;
      previewEndTimeRef.current = cardStart + recordedDurSec + 0.5;
      audio.play().catch(() => {});
    }

    // Visual rAF loop
    const canvas = document.querySelector('.laser-preview-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animStartWall = performance.now();

    const animate = () => {
      const elapsedMs = performance.now() - animStartWall;

      let pointCount: number;
      if (elapsedMs >= recordedDurMs) {
        pointCount = path.length;
      } else if (hasTimestamps) {
        pointCount = 0;
        for (let i = 0; i < path.length; i++) {
          if (path[i].t <= elapsedMs) pointCount = i + 1;
          else break;
        }
      } else {
        const progress = Math.min(1, elapsedMs / recordedDurMs);
        pointCount = Math.floor(progress * path.length);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (pointCount > 1 && editor) {
        // Convert page coords to screen coords using current camera
        const cam = editor.getCamera();
        const toScreen = (px: number, py: number) => ({
          x: (px + cam.x) * cam.z,
          y: (py + cam.y) * cam.z,
        });

        const p0 = toScreen(path[0].x, path[0].y);

        ctx.save();
        ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pointCount; i++) {
          const prev = toScreen(path[i - 1].x, path[i - 1].y);
          const curr = toScreen(path[i].x, path[i].y);
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        }
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pointCount; i++) {
          const prev = toScreen(path[i - 1].x, path[i - 1].y);
          const curr = toScreen(path[i].x, path[i].y);
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        }
        ctx.stroke();
        ctx.restore();
      }

      if (elapsedMs < recordedDurMs) {
        previewAnimRef.current = requestAnimationFrame(animate);
      }
    };

    previewAnimRef.current = requestAnimationFrame(animate);
  }, [audioFileUrl, getStartTime, previewingStepId, editor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(previewAnimRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
    };
  }, []);

  // No page separators needed — per-page view

  return (
    <div className="flex-shrink-0 bg-[#0B0D0F] border-t border-[#191C20]">
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div data-drag-handle className="flex items-center justify-between px-3 py-1.5 border-b border-[#191C20] cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-red-400/80 uppercase tracking-wider font-bold">🔴 Laser Sync</span>
          <span className="text-[10px] text-slate-600">{totalStrokes} stroke{totalStrokes !== 1 ? 's' : ''} · {currentPageName}{currentCameraGroupIdx >= 0 ? ` · Guide ${currentCameraGroupIdx + 1}` : ''}</span>
          {duration > 0 && <span className="text-[10px] text-slate-600">· {formatShort(duration)}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {!audioFileUrl ? (
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[9px] text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500/10">
              <Upload className="w-3 h-3" /> Upload Audio
            </button>
          ) : (
            <>
              <button
                onClick={() => { onPlayPause(); }}
                className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border transition-all ${isPlaying ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-slate-400 border-[#2a2a4e] hover:text-red-300 hover:border-red-500/30'}`}
              >
                {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              <span className="text-[10px] text-slate-400 font-mono">{formatMMSSss(currentTime)}</span>
              <button onClick={() => onAudioFileChange(null)} className="text-slate-600 hover:text-red-400 transition-colors" title="Remove audio"><Trash2 className="w-3 h-3" /></button>
            </>
          )}
          {totalStrokes > 0 && (
            <button onClick={resetAll} className="text-[9px] text-slate-500 hover:text-red-400 px-1.5 py-0.5 rounded border border-[#2a2a4e] hover:border-red-500/30 transition-colors">Reset</button>
          )}
          <button onClick={() => setMinimized(m => !m)} className="p-0.5 rounded hover:bg-[#12121f] text-slate-500 hover:text-red-300">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${minimized ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Cards track ────────────────────────────────────────────────── */}
      {!minimized && (
        <div className="flex items-stretch gap-0 px-3 py-3 overflow-x-auto" style={{ minHeight: 140, overscrollBehavior: 'contain' }}>
          {totalStrokes === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] text-slate-600">No laser strokes recorded yet. Present in Rough mode and draw with the laser tool.</p>
            </div>
          ) : (
            <>
              {currentPageStrokes.map((stroke, idx) => {
                const pageColor = PAGE_COLORS_HEX[Math.max(0, currentPageIdx) % PAGE_COLORS_HEX.length];
                const isHovered = hoveredStepId === stroke.id;
                const isPreviewing = previewingId === stroke.id;
                const startTime = getStartTime(stroke.id, idx);
                const recordedDur = getRecordedDuration(stroke);
                const strokeEnd = startTime + recordedDur;
                const isActive = audioFileUrl && currentTime >= startTime && currentTime < strokeEnd;
                const displayNum = idx + 1;

                return (
                  <div key={stroke.id} className="flex items-stretch">
                    <div
                      onMouseEnter={() => setHoveredStepId(stroke.id)}
                      onMouseLeave={() => setHoveredStepId(null)}
                      className={`flex-shrink-0 w-44 rounded-lg border flex flex-col overflow-hidden transition-all mx-1 ${
                        isActive
                          ? 'border-red-400/60 bg-red-500/8 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                          : isHovered
                          ? 'border-red-400/50 shadow-[0_0_8px_rgba(239,68,68,0.1)]'
                          : isPreviewing
                          ? 'border-red-400/60 bg-red-500/8 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                          : 'border-[#2a2a4e] bg-[#12121f] hover:border-red-500/30'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#1a1a2e] bg-[#0d0d18]">
                        <span className="text-[9px] font-bold text-slate-500">{String(displayNum).padStart(2, '0')}</span>
                        <StrokePreview path={stroke.path} color={pageColor} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium truncate" style={{ color: pageColor }}>{currentPageName}</div>
                          <div className="text-[8px] text-slate-600">{stroke.path.length} pts · ✏️ {recordedDur.toFixed(1)}s</div>
                        </div>
                      </div>

                      {/* Start time control + preview */}
                      <div className="px-2 py-2 flex items-center gap-1.5">
                        {/* Preview button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (previewingStepId === stroke.id) {
                              stopPreview();
                            } else {
                              playCardPreview(stroke.id, stroke, idx);
                            }
                          }}
                          className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 transition-all ${
                            previewingStepId === stroke.id
                              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                              : 'bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-red-300 hover:border-red-500/30'
                          }`}
                          title={previewingStepId === stroke.id ? 'Stop preview' : 'Preview stroke with audio'}
                        >
                          {previewingStepId === stroke.id ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
                        </button>

                        {/* Minus start time */}
                        <button
                          onClick={(e) => { e.stopPropagation(); adjustStartTime(idx, -0.5); }}
                          className="flex items-center justify-center w-5 h-5 rounded bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-red-300 hover:border-red-500/30 transition-all flex-shrink-0"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>

                        {/* Start time display */}
                        <span className="text-[9px] font-mono min-w-[62px] text-center select-none text-slate-300">
                          {formatMMSSss(startTime)}
                        </span>

                        {/* Plus start time */}
                        <button
                          onClick={(e) => { e.stopPropagation(); adjustStartTime(idx, 0.5); }}
                          className="flex items-center justify-center w-5 h-5 rounded bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-red-300 hover:border-red-500/30 transition-all flex-shrink-0"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>

                        {/* Delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteStroke(stroke.id); }}
                          className="flex items-center justify-center w-5 h-5 rounded bg-[#0d0d18] text-slate-500 border border-[#2a2a4e] hover:text-red-400 hover:border-red-500/30 transition-all flex-shrink-0 ml-auto"
                          title="Delete stroke"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
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
