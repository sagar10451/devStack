/**
 * Custom tldraw shape: Glow Notes Box
 * A rounded rectangle that holds multiple text lines.
 * Paste multiple lines → each becomes an independent item.
 * During presentation, lines glow/highlight one by one.
 */

import {
  ShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  T,
  type TLResizeInfo,
  type TLShape,
  type RecordProps,
  type Geometry2d,
} from 'tldraw';
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseClipboardLines } from '../pasteUtils';

// ─── Shape type registration ─────────────────────────────────────────────────

const GLOW_NOTES_TYPE = 'glow-notes' as const;

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [GLOW_NOTES_TYPE]: {
      w: number;
      h: number;
      lines: string;        // JSON stringified string[] — each line is an independent note
      borderColor: string;
      borderRadius: number;
      bgColor: string;
      textColor: string;
      fontSize: number;
      lineSpacing: number;
      title: string;
    };
  }
}

type IGlowNotesShape = TLShape<typeof GLOW_NOTES_TYPE>;

// ─── Colors ──────────────────────────────────────────────────────────────────

const BORDER_COLORS = [
  { id: '#1e293b', label: 'Dark' },
  { id: '#3b82f6', label: 'Blue' },
  { id: '#8b5cf6', label: 'Purple' },
  { id: '#ec4899', label: 'Pink' },
  { id: '#ef4444', label: 'Red' },
  { id: '#f97316', label: 'Orange' },
  { id: '#eab308', label: 'Yellow' },
  { id: '#22c55e', label: 'Green' },
  { id: '#06b6d4', label: 'Cyan' },
  { id: '#9ca3af', label: 'Gray' },
];

const BG_COLORS = [
  { id: 'transparent', label: 'None' },
  { id: '#ffffff', label: 'White' },
  { id: '#f8fafc', label: 'Slate 50' },
  { id: '#fef3c7', label: 'Amber 100' },
  { id: '#dbeafe', label: 'Blue 100' },
  { id: '#f3e8ff', label: 'Purple 100' },
  { id: '#fce7f3', label: 'Pink 100' },
  { id: '#dcfce7', label: 'Green 100' },
  { id: '#0f172a', label: 'Dark' },
  { id: '#1e1b4b', label: 'Indigo Dark' },
];

// ─── View Component ──────────────────────────────────────────────────────────

function GlowNotesView({
  shape,
  isEditing,
  onEditComplete,
}: {
  shape: IGlowNotesShape;
  isEditing: boolean;
  onEditComplete: (updates: Partial<IGlowNotesShape['props']>) => void;
}) {
  const { w, h, lines: linesJson, borderColor, borderRadius, bgColor, textColor, fontSize, lineSpacing, title } = shape.props;
  const lines: string[] = (() => { try { return JSON.parse(linesJson); } catch { return []; } })();

  const [editText, setEditText] = useState('');
  const [editTitle, setEditTitle] = useState(title);
  const [editBorderColor, setEditBorderColor] = useState(borderColor);
  const [editBgColor, setEditBgColor] = useState(bgColor);
  const [editTextColor, setEditTextColor] = useState(textColor);
  const [editFontSize, setEditFontSize] = useState(fontSize);
  const [editBorderRadius, setEditBorderRadius] = useState(borderRadius);
  const [editLineSpacing, setEditLineSpacing] = useState(lineSpacing);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle paste with same logic as canvas multi-line paste (HTML list parsing)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const plainText = e.clipboardData?.getData('text/plain');
    const html = e.clipboardData?.getData('text/html');

    // Skip tldraw internal paste
    const tldrawData = e.clipboardData?.getData('application/tldraw');
    if (tldrawData) return;

    const parsed = parseClipboardLines(plainText, html);
    if (!parsed) return; // Single line or empty — let default paste work

    e.preventDefault();
    const newText = parsed.map(l => l.text).join('\n');
    setEditText(prev => {
      const ta = textareaRef.current;
      if (!ta) return prev ? prev + '\n' + newText : newText;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const before = prev.substring(0, start);
      const after = prev.substring(end);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = before.length + newText.length;
      }, 0);
      return before + newText + after;
    });
  }, []);

  // Sync edit state when entering edit mode
  useEffect(() => {
    if (isEditing) {
      setEditText(lines.join('\n'));
      setEditTitle(title);
      setEditBorderColor(borderColor);
      setEditBgColor(bgColor);
      setEditTextColor(textColor);
      setEditFontSize(fontSize);
      setEditBorderRadius(borderRadius);
      setEditLineSpacing(lineSpacing);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isEditing]);

  const handleDone = useCallback(() => {
    const newLines = editText.split('\n').filter(l => l.trim() !== '');
    onEditComplete({
      lines: JSON.stringify(newLines),
      title: editTitle,
      borderColor: editBorderColor,
      bgColor: editBgColor,
      textColor: editTextColor,
      fontSize: editFontSize,
      borderRadius: editBorderRadius,
      lineSpacing: editLineSpacing,
    });
  }, [editText, editTitle, editBorderColor, editBgColor, editTextColor, editFontSize, editBorderRadius, editLineSpacing, onEditComplete]);

  // ─── Edit mode ─────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        style={{
          width: w, height: h,
          borderRadius: editBorderRadius,
          border: `2px solid ${editBorderColor}`,
          background: editBgColor === 'transparent' ? '#fff' : editBgColor,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{ fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 100, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 2 }}>
            {BORDER_COLORS.map(c => (
              <button
                key={c.id}
                onClick={() => setEditBorderColor(c.id)}
                title={c.label}
                style={{
                  width: 14, height: 14, borderRadius: '50%', background: c.id, border: editBorderColor === c.id ? '2px solid #000' : '1px solid #ccc',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <select value={editBgColor} onChange={e => setEditBgColor(e.target.value)} style={{ fontSize: 10, border: '1px solid #cbd5e1', borderRadius: 4, padding: '1px 4px' }}>
            {BG_COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input type="color" value={editTextColor} onChange={e => setEditTextColor(e.target.value)} style={{ width: 20, height: 18, border: 'none', padding: 0, cursor: 'pointer' }} title="Text color" />
          <label style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }}>
            Size
            <input type="number" value={editFontSize} onChange={e => setEditFontSize(Number(e.target.value))} min={10} max={48} style={{ width: 32, fontSize: 10, border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 3px', textAlign: 'center' }} />
          </label>
          <label style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }}>
            Radius
            <input type="number" value={editBorderRadius} onChange={e => setEditBorderRadius(Number(e.target.value))} min={0} max={50} style={{ width: 32, fontSize: 10, border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 3px', textAlign: 'center' }} />
          </label>
          <label style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 2 }}>
            Gap
            <input type="number" value={editLineSpacing} onChange={e => setEditLineSpacing(Number(e.target.value))} min={0} max={30} style={{ width: 28, fontSize: 10, border: '1px solid #cbd5e1', borderRadius: 3, padding: '1px 3px', textAlign: 'center' }} />
          </label>
          <button onClick={handleDone} style={{ fontSize: 10, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto' }}>
            Done
          </button>
        </div>
        {/* Text area — paste/type lines here */}
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          onPaste={handlePaste}
          placeholder="Paste or type notes here...&#10;Each line becomes a separate item.&#10;&#10;• Bullet points work too&#10;1. Numbered lists also"
          style={{
            flex: 1, resize: 'none', border: 'none', outline: 'none',
            padding: '10px 14px', fontSize: editFontSize, lineHeight: 1.6,
            fontFamily: 'tldraw_serif, Georgia, serif',
            color: editTextColor, background: 'transparent',
          }}
        />
      </div>
    );
  }

  // ─── Read-only mode ────────────────────────────────────────────────────
  return (
    <div
      className="glow-notes-box"
      style={{
        width: w, height: h,
        borderRadius,
        border: `1.5px solid ${borderColor}`,
        background: bgColor === '#ffffff' || bgColor === 'transparent' ? 'rgba(10, 15, 30, 0.92)' : bgColor,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: `0 0 8px ${borderColor}66, 0 0 24px ${borderColor}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      {/* Title bar */}
      {title && (
        <div style={{
          padding: '6px 14px',
          borderBottom: `1px solid ${borderColor}20`,
          fontSize: fontSize * 0.85,
          fontWeight: 700,
          color: '#94a3b8',
          fontFamily: 'tldraw_serif, Georgia, serif',
          opacity: 0.7,
        }}>
          {title}
        </div>
      )}
      {/* Lines */}
      <div style={{ flex: 1, padding: '10px 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: lineSpacing }}>
        {lines.length === 0 ? (
          <div style={{ color: '#475569', fontSize: fontSize * 0.85, fontStyle: 'italic', fontFamily: 'tldraw_serif, Georgia, serif' }}>
            Double-click to add notes...
          </div>
        ) : (
          lines.map((line, i) => {
            // Detect sub-points: starts with spaces, ◦, or numbered with indent
            const isSubPoint = line.startsWith('  ') || line.startsWith('\t') || line.trimStart().startsWith('◦');
            return (
            <div
              key={i}
              data-glow-line={i}
              style={{
                fontSize: isSubPoint ? fontSize * 0.88 : fontSize,
                lineHeight: 1.5,
                color: isSubPoint ? '#94a3b8' : '#e2e8f0',
                fontFamily: 'tldraw_serif, Georgia, serif',
                padding: isSubPoint ? '2px 8px 2px 24px' : '4px 8px',
                borderRadius: 6,
                transition: 'all 0.3s ease',
                whiteSpace: 'pre-wrap',
                fontWeight: isSubPoint ? 400 : 600,
              }}
            >
              {line}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Shape Util ──────────────────────────────────────────────────────────────

export class GlowNotesShapeUtil extends ShapeUtil<IGlowNotesShape> {
  static override type = GLOW_NOTES_TYPE;
  static override props: RecordProps<IGlowNotesShape> = {
    w: T.number,
    h: T.number,
    lines: T.string,
    borderColor: T.string,
    borderRadius: T.number,
    bgColor: T.string,
    textColor: T.string,
    fontSize: T.number,
    lineSpacing: T.number,
    title: T.string,
  };

  getDefaultProps(): IGlowNotesShape['props'] {
    return {
      w: 450,
      h: 350,
      lines: '[]',
      borderColor: '#3b82f6',
      borderRadius: 16,
      bgColor: '#ffffff',
      textColor: '#1e293b',
      fontSize: 18,
      lineSpacing: 4,
      title: '',
    };
  }

  override canEdit() { return true; }
  override canResize() { return true; }
  override isAspectRatioLocked() { return false; }

  getGeometry(shape: IGlowNotesShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: any, info: TLResizeInfo<any>) {
    return resizeBox(shape, info);
  }

  component(shape: IGlowNotesShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;

    return (
      <HTMLContainer style={{ pointerEvents: isEditing ? 'all' : 'auto' }}>
        <GlowNotesView
          shape={shape}
          isEditing={isEditing}
          onEditComplete={(updates) => {
            this.editor.updateShape<IGlowNotesShape>({
              id: shape.id,
              type: GLOW_NOTES_TYPE,
              props: { ...shape.props, ...updates },
            });
            this.editor.setEditingShape(null);
          }}
        />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: IGlowNotesShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, shape.props.borderRadius);
    return path;
  }
}
