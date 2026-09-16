/**
 * DraggableWidget — a reusable wrapper that makes any panel/widget freely
 * draggable on the canvas. Drag from the header area (data-drag-handle).
 */

import { useRef, useState, useCallback, type ReactNode } from 'react';

interface DraggableWidgetProps {
  children: ReactNode;
  /** Initial CSS position. Use absolute values or Tailwind-compatible defaults. */
  defaultPosition?: { x: number; y: number };
  /** z-index for stacking */
  zIndex?: number;
  /** Optional class on the outer wrapper */
  className?: string;
  /** Anchor to bottom of container — widget expands upward, always visible */
  anchorBottom?: boolean;
}

export default function DraggableWidget({
  children,
  defaultPosition,
  zIndex = 40,
  className = '',
  anchorBottom = false,
}: DraggableWidgetProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(defaultPosition || null);
  const [hasBeenDragged, setHasBeenDragged] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    // Only drag from elements marked with data-drag-handle
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
      setHasBeenDragged(true);
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  // Compute style based on anchor mode and drag state
  const style: React.CSSProperties = { zIndex };

  if (anchorBottom && !hasBeenDragged) {
    // Not dragged yet — anchor to bottom
    style.bottom = 0;
    style.left = position?.x ?? 0;
  } else if (position) {
    // Has been dragged or non-anchor mode — use absolute position
    style.left = position.x;
    style.top = position.y;
  }

  return (
    <div
      ref={containerRef}
      className={`absolute ${className}`}
      style={style}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
}
