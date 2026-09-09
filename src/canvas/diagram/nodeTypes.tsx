/**
 * Custom React Flow node types.
 * Single "shape" node with tech logo icon, label, subtitle, gradient bg, 8 handles,
 * and a resize handle at the bottom-right corner.
 */

import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { getIconComponent } from './iconRegistry';
import { ContentNode } from './ContentNode';
import { NotesNode } from './NotesNode';

const DEFAULT_W = 130;
const DEFAULT_H = 90;
const MIN_W = 60;
const MIN_H = 50;

interface ShapeNodeData {
  label: string;
  icon: string;
  bg: string;
  border: string;
  sub?: string;
  w?: number;
  h?: number;
  [key: string]: unknown;
}

function CustomNodeBase({ id, data, selected }: NodeProps) {
  const { label, icon, bg, border, sub, w, h } = data as unknown as ShapeNodeData;
  const width = w || DEFAULT_W;
  const height = h || DEFAULT_H;
  const { updateNodeData } = useReactFlow();

  const IconComponent = getIconComponent(icon);

  // Scale icon size proportionally to node size
  const iconSize = Math.max(16, Math.min(64, Math.floor(Math.min(width, height) * 0.35)));

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;

    const onMouseMove = (ev: MouseEvent) => {
      const newW = Math.max(MIN_W, startW + (ev.clientX - startX));
      const newH = Math.max(MIN_H, startH + (ev.clientY - startY));
      updateNodeData(id, { w: newW, h: newH });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [id, width, height, updateNodeData]);

  return (
    <div
      className={`rf-custom-node${selected ? ' rf-selected' : ''}`}
      style={{
        background: bg,
        border: `2px solid ${border}`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <Handle id="top-target" type="target" position={Position.Top} />
      <Handle id="top-source" type="source" position={Position.Top} />
      <Handle id="left-target" type="target" position={Position.Left} />
      <Handle id="left-source" type="source" position={Position.Left} />
      <div className="rf-node-icon">
        {IconComponent ? <IconComponent width={iconSize} height={iconSize} /> : <span style={{ fontSize: iconSize }}>{icon}</span>}
      </div>
      <div className="rf-node-label">{label}</div>
      {sub && <div className="rf-node-sub">{sub}</div>}
      <Handle id="bottom-target" type="target" position={Position.Bottom} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} />
      <Handle id="right-target" type="target" position={Position.Right} />
      <Handle id="right-source" type="source" position={Position.Right} />

      {/* Resize handle */}
      <div
        className="rf-resize-handle nodrag"
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

export const ShapeNode = memo(CustomNodeBase);

export const nodeTypes = {
  shape: ShapeNode,
  content: ContentNode,
  notes: NotesNode,
};
