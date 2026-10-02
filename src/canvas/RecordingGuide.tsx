/**
 * RecordingGuide — 16:9 aspect ratio overlay for aligning Mac screen recording.
 * Shows a clear 16:9 window with dimmed surroundings.
 * Draggable + resizable (corner), always maintains 16:9.
 * Displays pixel dimensions.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const ASPECT = 16 / 9;

interface RecordingGuideProps {
  visible: boolean;
}

export default function RecordingGuide({ visible }: RecordingGuideProps) {
  // Auto-calculate initial size: fill as much screen as possible
  const [rect, setRect] = useState(() => {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    let w = sw - 40;
    let h = w / ASPECT;
    if (h > sh - 40) {
      h = sh - 40;
      w = h * ASPECT;
    }
    return {
      x: Math.round((sw - w) / 2),
      y: Math.round((sh - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
    };
  });

  // Recalculate on window resize
  useEffect(() => {
    const onResize = () => {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      let w = sw - 40;
      let h = w / ASPECT;
      if (h > sh - 40) {
        h = sh - 40;
        w = h * ASPECT;
      }
      setRect({
        x: Math.round((sw - w) / 2),
        y: Math.round((sh - h) / 2),
        w: Math.round(w),
        h: Math.round(h),
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; corner: string } | null>(null);

  // Drag handler
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.x, origY: rect.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setRect(prev => ({
        ...prev,
        x: Math.max(0, Math.min(window.innerWidth - prev.w, dragRef.current!.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - prev.h, dragRef.current!.origY + dy)),
      }));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [rect.x, rect.y]);

  // Resize handler — corner drag, locked 16:9
  const onResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: rect.w, origH: rect.h, origX: rect.x, origY: rect.y, corner };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const r = resizeRef.current;
      const dx = ev.clientX - r.startX;
      const dy = ev.clientY - r.startY;

      let newW = r.origW;
      let newH = r.origH;
      let newX = r.origX;
      let newY = r.origY;

      if (r.corner === 'br') {
        // Bottom-right: grow/shrink from bottom-right
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy * ASPECT;
        newW = Math.max(320, r.origW + delta);
        newH = newW / ASPECT;
      } else if (r.corner === 'bl') {
        const delta = Math.abs(dx) > Math.abs(dy) ? -dx : dy * ASPECT;
        newW = Math.max(320, r.origW + delta);
        newH = newW / ASPECT;
        newX = r.origX + r.origW - newW;
      } else if (r.corner === 'tr') {
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : -dy * ASPECT;
        newW = Math.max(320, r.origW + delta);
        newH = newW / ASPECT;
        newY = r.origY + r.origH - newH;
      } else if (r.corner === 'tl') {
        const delta = Math.abs(dx) > Math.abs(dy) ? -dx : -dy * ASPECT;
        newW = Math.max(320, r.origW + delta);
        newH = newW / ASPECT;
        newX = r.origX + r.origW - newW;
        newY = r.origY + r.origH - newH;
      }

      // Clamp to screen
      if (newX < 0) { newW += newX; newH = newW / ASPECT; newX = 0; }
      if (newY < 0) { newH += newY; newW = newH * ASPECT; newY = 0; }
      if (newX + newW > window.innerWidth) { newW = window.innerWidth - newX; newH = newW / ASPECT; }
      if (newY + newH > window.innerHeight) { newH = window.innerHeight - newY; newW = newH * ASPECT; }

      setRect({ x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [rect]);

  if (!visible) return null;

  // Corner handle style
  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: 14,
    height: 14,
    background: '#fff',
    border: '2px solid #0B0D0F',
    borderRadius: 3,
    cursor,
    zIndex: 100002,
  });

  return (
    <div className="fixed inset-0" style={{ zIndex: 100000, pointerEvents: 'none' }}>
      {/* Dimmed overlay — 4 rectangles around the clear window */}
      {/* Top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rect.y, background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto' }} />
      {/* Bottom */}
      <div style={{ position: 'absolute', top: rect.y + rect.h, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto' }} />
      {/* Left */}
      <div style={{ position: 'absolute', top: rect.y, left: 0, width: rect.x, height: rect.h, background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto' }} />
      {/* Right */}
      <div style={{ position: 'absolute', top: rect.y, left: rect.x + rect.w, right: 0, height: rect.h, background: 'rgba(0,0,0,0.65)', pointerEvents: 'auto' }} />

      {/* Clear window — draggable area */}
      <div
        style={{
          position: 'absolute',
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          border: '2px solid rgba(255,255,255,0.6)',
          borderRadius: 4,
          cursor: 'move',
          pointerEvents: 'auto',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 0 30px rgba(0,0,0,0.3)',
        }}
        onMouseDown={onDragStart}
      >
        {/* Dimension label */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.5px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {rect.w} × {rect.h} &nbsp;
          <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400, fontSize: 12 }}>16:9</span>
        </div>

        {/* Instruction label */}
        <div
          style={{
            position: 'absolute',
            bottom: -32,
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Drag to move · Corners to resize · Align Mac capture here · Click → to start
        </div>

        {/* Corner resize handles */}
        {/* Top-left */}
        <div style={{ ...handleStyle('nwse-resize'), top: -7, left: -7 }} onMouseDown={(e) => onResizeStart(e, 'tl')} />
        {/* Top-right */}
        <div style={{ ...handleStyle('nesw-resize'), top: -7, right: -7 }} onMouseDown={(e) => onResizeStart(e, 'tr')} />
        {/* Bottom-left */}
        <div style={{ ...handleStyle('nesw-resize'), bottom: -7, left: -7 }} onMouseDown={(e) => onResizeStart(e, 'bl')} />
        {/* Bottom-right */}
        <div style={{ ...handleStyle('nwse-resize'), bottom: -7, right: -7 }} onMouseDown={(e) => onResizeStart(e, 'br')} />

        {/* Rule of thirds grid — subtle */}
        <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}
