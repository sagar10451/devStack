/**
 * NotesNode — Rich text + image RF node with customizable colors and font size.
 * Image on top (centered), text below (centered). Both scale with node size.
 * Resize from all 4 corners and edges. Clean minimal design.
 * Double-click text area to edit. Paste/drop image.
 */

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';

const DEFAULT_W = 220;
const DEFAULT_H = 140;
const MIN_W = 80;
const MIN_H = 60;

const PRESET_COLORS = [
  '#1e293b', '#0f172a', '#18181b', '#1c1917', '#0c0a09',
  '#1e3a5f', '#1a2744', '#2d1b4e', '#3b1323', '#1a3c2a',
  '#ff9900', '#58a6ff', '#10b981', '#f472b6', '#a78bfa',
  '#ef4444', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899',
  '#ffffff', '#e2e8f0', '#94a3b8', '#64748b', '#334155',
  'transparent',
];

const FONT_SIZES = [
  { label: 'XS', value: 10 },
  { label: 'S', value: 12 },
  { label: 'M', value: 14 },
  { label: 'L', value: 18 },
  { label: 'XL', value: 24 },
  { label: '2XL', value: 32 },
  { label: '3XL', value: 48 },
];

const FONT_FAMILIES = [
  { label: 'Sans', value: "'Inter', -apple-system, sans-serif" },
  { label: 'Serif', value: "'Georgia', 'Times New Roman', serif" },
  { label: 'Mono', value: "'JetBrains Mono', 'Fira Code', monospace" },
  { label: 'Draw', value: "'Caveat', 'Segoe Print', cursive" },
];

interface NotesNodeData {
  label: string;
  text?: string;
  imageUrl?: string;
  bgColor?: string;
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  w?: number;
  h?: number;
  [key: string]: unknown;
}

function NotesNodeBase({ id, data, selected }: NodeProps) {
  const d = data as unknown as NotesNodeData;
  const text = d.text || '';
  const imageUrl = d.imageUrl || '';
  const bgColor = d.bgColor || '#1e293b';
  const borderColor = d.borderColor || '#334155';
  const textColor = d.textColor || '#e2e8f0';
  const fontSize = d.fontSize || 14;
  const fontFamily = d.fontFamily || "'Inter', -apple-system, sans-serif";
  const bold = d.bold || false;
  const italic = d.italic || false;
  const width = d.w || DEFAULT_W;
  const height = d.h || DEFAULT_H;

  const { updateNodeData } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarTab, setToolbarTab] = useState<'color' | 'font' | 'fontFamily' | null>(null);
  const [colorTarget, setColorTarget] = useState<'bg' | 'border' | 'text'>('bg');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setEditText(text); }, [text]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Show toolbar when selected, hide when deselected
  useEffect(() => {
    if (!selected) { setShowToolbar(false); setToolbarTab(null); }
    else setShowToolbar(true);
  }, [selected]);

  const saveText = useCallback(() => {
    setIsEditing(false);
    updateNodeData(id, { text: editText });
  }, [id, editText, updateNodeData]);

  const setColor = useCallback((color: string) => {
    const key = colorTarget === 'bg' ? 'bgColor' : colorTarget === 'border' ? 'borderColor' : 'textColor';
    updateNodeData(id, { [key]: color });
    setToolbarTab(null);
  }, [id, colorTarget, updateNodeData]);

  const setFontSize = useCallback((size: number) => {
    updateNodeData(id, { fontSize: size });
    setToolbarTab(null);
  }, [id, updateNodeData]);

  // ─── Image paste / drop ──────────────────────────────────────────────────
  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Compress to WebP via canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const webp = canvas.toDataURL('image/webp', 0.8);
        updateNodeData(id, { imageUrl: webp });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, [id, updateNodeData]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
  }, [handleImageFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const removeImage = useCallback(() => {
    updateNodeData(id, { imageUrl: '' });
  }, [id, updateNodeData]);

  // ─── Resize from all sides ───────────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width;
    const startH = height;

    const onMouseMove = (ev: MouseEvent) => {
      let newW = startW;
      let newH = startH;

      if (corner.includes('r')) newW = Math.max(MIN_W, startW + (ev.clientX - startX));
      if (corner.includes('l')) newW = Math.max(MIN_W, startW - (ev.clientX - startX));
      if (corner.includes('b')) newH = Math.max(MIN_H, startH + (ev.clientY - startY));
      if (corner.includes('t')) newH = Math.max(MIN_H, startH - (ev.clientY - startY));

      updateNodeData(id, { w: newW, h: newH });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [id, width, height, updateNodeData]);

  // Scale image and text proportionally to node size
  const imageMaxH = imageUrl ? Math.max(30, height * 0.5) : 0;
  const scaledFontSize = Math.max(8, fontSize * (width / DEFAULT_W));

  return (
    <div
      className={`rf-custom-node rf-notes-node${selected ? ' rf-selected' : ''}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: bgColor === 'transparent' ? 'transparent' : bgColor,
        border: borderColor === 'transparent' ? 'none' : `3px solid ${borderColor}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        position: 'relative',
        cursor: 'default',
      }}
      onDoubleClick={(e) => { e.stopPropagation(); if (!imageUrl || e.clientY > (e.currentTarget.getBoundingClientRect().top + imageMaxH)) setIsEditing(true); }}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Connection handles */}
      <Handle id="top-target" type="target" position={Position.Top} />
      <Handle id="top-source" type="source" position={Position.Top} />
      <Handle id="left-target" type="target" position={Position.Left} />
      <Handle id="left-source" type="source" position={Position.Left} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} />
      <Handle id="right-target" type="target" position={Position.Right} />
      <Handle id="right-source" type="source" position={Position.Right} />

      {/* ─── Toolbar (above node) ──────────────────────────────────────── */}
      {showToolbar && (
        <div
          ref={toolbarRef}
          className="nodrag rf-notes-toolbar"
          style={{
            position: 'absolute',
            top: -32,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 2,
            background: '#0a0f1e',
            borderRadius: 8,
            padding: '4px 6px',
            border: '1px solid #1e293b',
            zIndex: 20,
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* BG */}
          <button
            onClick={() => { setColorTarget('bg'); setToolbarTab(toolbarTab === 'color' && colorTarget === 'bg' ? null : 'color'); }}
            title="Background"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: bgColor === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/6px 6px' : bgColor,
              border: toolbarTab === 'color' && colorTarget === 'bg' ? '2px solid #58a6ff' : '1px solid #334155',
              cursor: 'pointer',
            }}
          />
          {/* Border */}
          <button
            onClick={() => { setColorTarget('border'); setToolbarTab(toolbarTab === 'color' && colorTarget === 'border' ? null : 'color'); }}
            title="Border"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: 'transparent',
              border: `3px solid ${borderColor === 'transparent' ? '#475569' : borderColor}`,
              cursor: 'pointer',
              boxShadow: toolbarTab === 'color' && colorTarget === 'border' ? '0 0 0 1px #58a6ff' : 'none',
            }}
          />
          {/* Text color */}
          <button
            onClick={() => { setColorTarget('text'); setToolbarTab(toolbarTab === 'color' && colorTarget === 'text' ? null : 'color'); }}
            title="Text color"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: '#0f172a',
              border: '1px solid #334155',
              color: textColor,
              fontSize: 11,
              fontWeight: 'bold',
              lineHeight: '16px',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: toolbarTab === 'color' && colorTarget === 'text' ? '0 0 0 1px #58a6ff' : 'none',
            }}
          >A</button>

          <div style={{ width: 1, background: '#1e293b', margin: '0 2px' }} />

          {/* Font size */}
          <button
            onClick={() => setToolbarTab(toolbarTab === 'font' ? null : 'font')}
            title="Font size"
            style={{
              height: 18, borderRadius: 4, padding: '0 5px',
              background: toolbarTab === 'font' ? '#1e3a5f' : '#0f172a',
              border: '1px solid #334155',
              color: '#94a3b8',
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: '16px',
            }}
          >{fontSize}px</button>

          <div style={{ width: 1, background: '#1e293b', margin: '0 2px' }} />

          {/* Image upload */}
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleImageFile(file);
              };
              input.click();
            }}
            title="Add image"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#94a3b8',
              fontSize: 11,
              cursor: 'pointer',
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >🖼</button>

          <div style={{ width: 1, background: '#1e293b', margin: '0 2px' }} />

          {/* Font family */}
          <button
            onClick={() => setToolbarTab(toolbarTab === 'fontFamily' ? null : 'fontFamily')}
            title="Font"
            style={{
              height: 18, borderRadius: 4, padding: '0 5px',
              background: toolbarTab === 'fontFamily' ? '#1e3a5f' : '#0f172a',
              border: '1px solid #334155',
              color: '#94a3b8',
              fontSize: 9,
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: '16px',
              fontFamily: fontFamily,
            }}
          >{FONT_FAMILIES.find(f => f.value === fontFamily)?.label || 'Sans'}</button>

          {/* Bold */}
          <button
            onClick={() => updateNodeData(id, { bold: !bold })}
            title="Bold"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: bold ? '#1e3a5f' : '#0f172a',
              border: bold ? '1px solid #58a6ff' : '1px solid #334155',
              color: bold ? '#58a6ff' : '#64748b',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >B</button>

          {/* Italic */}
          <button
            onClick={() => updateNodeData(id, { italic: !italic })}
            title="Italic"
            style={{
              width: 18, height: 18, borderRadius: 4,
              background: italic ? '#1e3a5f' : '#0f172a',
              border: italic ? '1px solid #58a6ff' : '1px solid #334155',
              color: italic ? '#58a6ff' : '#64748b',
              fontSize: 11,
              fontStyle: 'italic',
              cursor: 'pointer',
              lineHeight: '16px',
              textAlign: 'center',
            }}
          >I</button>
        </div>
      )}

      {/* ─── Color picker dropdown ─────────────────────────────────────── */}
      {toolbarTab === 'color' && (
        <div
          className="nodrag rf-notes-color-panel"
          style={{
            position: 'absolute',
            top: -32 - 68,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 3,
            padding: 6,
            background: '#0a0f1e',
            borderRadius: 8,
            border: '1px solid #1e293b',
            width: 155,
            zIndex: 30,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 16, height: 16, borderRadius: 3,
                background: c === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/6px 6px' : c,
                border: `1px solid ${c === 'transparent' ? '#475569' : c === '#ffffff' ? '#64748b' : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      )}

      {/* ─── Font size dropdown ────────────────────────────────────────── */}
      {toolbarTab === 'font' && (
        <div
          className="nodrag rf-notes-font-panel"
          style={{
            position: 'absolute',
            top: -32 - 38,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 3,
            padding: '4px 6px',
            background: '#0a0f1e',
            borderRadius: 8,
            border: '1px solid #1e293b',
            zIndex: 30,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {FONT_SIZES.map(f => (
            <button
              key={f.value}
              onClick={() => setFontSize(f.value)}
              style={{
                padding: '2px 6px', borderRadius: 4,
                background: fontSize === f.value ? '#1e3a5f' : 'transparent',
                border: fontSize === f.value ? '1px solid #58a6ff' : '1px solid transparent',
                color: fontSize === f.value ? '#58a6ff' : '#64748b',
                fontSize: 9, fontWeight: 600, cursor: 'pointer',
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* ─── Font family dropdown ──────────────────────────────────────── */}
      {toolbarTab === 'fontFamily' && (
        <div
          className="nodrag rf-notes-font-panel"
          style={{
            position: 'absolute',
            top: -32 - 38,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 3,
            padding: '4px 6px',
            background: '#0a0f1e',
            borderRadius: 8,
            border: '1px solid #1e293b',
            zIndex: 30,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {FONT_FAMILIES.map(f => (
            <button
              key={f.label}
              onClick={() => { updateNodeData(id, { fontFamily: f.value }); setToolbarTab(null); }}
              style={{
                padding: '2px 8px', borderRadius: 4,
                background: fontFamily === f.value ? '#1e3a5f' : 'transparent',
                border: fontFamily === f.value ? '1px solid #58a6ff' : '1px solid transparent',
                color: fontFamily === f.value ? '#58a6ff' : '#64748b',
                fontSize: 10, cursor: 'pointer',
                fontFamily: f.value,
              }}
            >{f.label}</button>
          ))}
        </div>
      )}

      {/* ─── Image ─────────────────────────────────────────────────────── */}
      {imageUrl && (
        <div style={{ position: 'relative', width: '100%', maxHeight: imageMaxH, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 8px 0', flexShrink: 0 }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              maxWidth: '90%',
              maxHeight: imageMaxH - 8,
              objectFit: 'contain',
              borderRadius: 6,
            }}
            draggable={false}
          />
          {selected && (
            <button
              className="nodrag"
              onClick={(e) => { e.stopPropagation(); removeImage(); }}
              style={{
                position: 'absolute',
                top: 4,
                right: 8,
                width: 16, height: 16, borderRadius: '50%',
                background: 'rgba(239,68,68,0.8)',
                border: 'none',
                color: '#fff',
                fontSize: 10,
                lineHeight: '16px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >✕</button>
          )}
        </div>
      )}

      {/* ─── Text ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="nodrag nowheel"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === 'Escape') saveText();
              e.stopPropagation();
            }}
            onPaste={handlePaste}
            style={{
              width: '100%',
              height: '100%',
              background: 'transparent',
              color: textColor,
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '6px 10px',
              fontSize: scaledFontSize,
              lineHeight: 1.4,
              fontFamily,
              fontWeight: bold ? 'bold' : 'normal',
              fontStyle: italic ? 'italic' : 'normal',
              textAlign: 'center' as const,
            }}
            placeholder="Type here..."
          />
        ) : (
          <div
            style={{
              padding: '6px 10px',
              color: textColor,
              fontSize: scaledFontSize,
              lineHeight: 1.4,
              fontFamily,
              fontWeight: bold ? 'bold' : 'normal',
              fontStyle: italic ? 'italic' : 'normal',
              textAlign: 'center' as const,
              wordBreak: 'break-word',
              width: '100%',
            }}
          >
            {text || <span style={{ color: '#334155', fontStyle: 'italic', fontSize: Math.min(scaledFontSize, 13) }}>Double-click to type</span>}
          </div>
        )}
      </div>

      {/* ─── Resize handles (all 4 corners + 4 edges) ──────────────────── */}
      {/* Corners */}
      <div className="rf-resize-handle nodrag" style={{ top: -3, left: -3, right: 'auto', bottom: 'auto', cursor: 'nw-resize', borderRight: 'none', borderBottom: 'none', borderLeft: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid rgba(255,255,255,0.3)', borderRadius: '4px 0 0 0' }} onMouseDown={(e) => onResizeStart(e, 'tl')} />
      <div className="rf-resize-handle nodrag" style={{ top: -3, right: -3, left: 'auto', bottom: 'auto', cursor: 'ne-resize', borderLeft: 'none', borderBottom: 'none', borderRight: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid rgba(255,255,255,0.3)', borderRadius: '0 4px 0 0' }} onMouseDown={(e) => onResizeStart(e, 'tr')} />
      <div className="rf-resize-handle nodrag" style={{ bottom: -3, left: -3, right: 'auto', top: 'auto', cursor: 'sw-resize', borderRight: 'none', borderTop: 'none', borderLeft: '3px solid rgba(255,255,255,0.3)', borderBottom: '3px solid rgba(255,255,255,0.3)', borderRadius: '0 0 0 4px' }} onMouseDown={(e) => onResizeStart(e, 'bl')} />
      <div className="rf-resize-handle nodrag" style={{ bottom: -3, right: -3, left: 'auto', top: 'auto', cursor: 'se-resize', borderLeft: 'none', borderTop: 'none', borderRight: '3px solid rgba(255,255,255,0.3)', borderBottom: '3px solid rgba(255,255,255,0.3)', borderRadius: '0 0 4px 0' }} onMouseDown={(e) => onResizeStart(e, 'br')} />
      {/* Edges */}
      <div className="rf-resize-handle nodrag" style={{ top: '50%', left: -4, right: 'auto', bottom: 'auto', transform: 'translateY(-50%)', cursor: 'w-resize', width: 6, height: 24, border: 'none', borderLeft: '3px solid rgba(255,255,255,0.25)', borderRadius: 2 }} onMouseDown={(e) => onResizeStart(e, 'l')} />
      <div className="rf-resize-handle nodrag" style={{ top: '50%', right: -4, left: 'auto', bottom: 'auto', transform: 'translateY(-50%)', cursor: 'e-resize', width: 6, height: 24, border: 'none', borderRight: '3px solid rgba(255,255,255,0.25)', borderRadius: 2 }} onMouseDown={(e) => onResizeStart(e, 'r')} />
      <div className="rf-resize-handle nodrag" style={{ top: -4, left: '50%', right: 'auto', bottom: 'auto', transform: 'translateX(-50%)', cursor: 'n-resize', width: 24, height: 6, border: 'none', borderTop: '3px solid rgba(255,255,255,0.25)', borderRadius: 2 }} onMouseDown={(e) => onResizeStart(e, 't')} />
      <div className="rf-resize-handle nodrag" style={{ bottom: -4, left: '50%', right: 'auto', top: 'auto', transform: 'translateX(-50%)', cursor: 's-resize', width: 24, height: 6, border: 'none', borderBottom: '3px solid rgba(255,255,255,0.25)', borderRadius: 2 }} onMouseDown={(e) => onResizeStart(e, 'b')} />
    </div>
  );
}

export const NotesNode = memo(NotesNodeBase);
