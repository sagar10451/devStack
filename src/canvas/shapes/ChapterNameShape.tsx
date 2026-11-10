/**
 * Custom tldraw shape: Chapter Name
 * A styled text box with Topic/Subtitle-like color dots and popup.
 * Movable, resizable, editable. Added to timeline automatically.
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
import { useState, useRef, useEffect } from 'react';

const CHAPTER_NAME_TYPE = 'chapter-name' as const;

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [CHAPTER_NAME_TYPE]: {
      w: number;
      h: number;
      text: string;
      fontSize: number;
      fontWeight: string;
      textColor: string;
      borderColor: string;
      mode: string;
    };
  }
}

type IChapterNameShape = TLShape<typeof CHAPTER_NAME_TYPE>;

const TEXT_COLORS = ['#ffffff', '#e2e8f0', '#1e293b', '#3b82f6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6', '#eab308'];
const BORDER_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', 'transparent'];

function ChapterNameView({
  shape,
  isEditing,
  isSelected,
  onEditComplete,
}: {
  shape: IChapterNameShape;
  isEditing: boolean;
  isSelected: boolean;
  onEditComplete: (updates: Partial<IChapterNameShape['props']>) => void;
}) {
  const { text, fontSize, fontWeight, textColor, borderColor, mode } = shape.props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close picker when deselected
  useEffect(() => {
    if (!isSelected) setShowPicker(false);
  }, [isSelected]);

  // Show controls when selected OR editing
  const showControls = isSelected || isEditing;

  return (
    <div
      className="chapter-name-box"
      style={{
        width: shape.props.w,
        height: shape.props.h,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Text + underline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => onEditComplete({ text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { (e.target as HTMLInputElement).blur(); } }}
            placeholder="Chapter Name"
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'tldraw_serif, Georgia, serif', fontSize, fontWeight: fontWeight as any,
              color: textColor, textAlign: 'center', width: '100%',
              textShadow: `0 0 16px ${textColor}40, 0 0 6px ${textColor}25`,
            }}
            className="placeholder:text-[#4a4a6a] placeholder:font-normal"
          />
        ) : (
          <span style={{
            fontFamily: 'tldraw_serif, Georgia, serif', fontSize, fontWeight: fontWeight as any,
            color: textColor, textAlign: 'center', width: '100%',
            textShadow: `0 0 16px ${textColor}40, 0 0 6px ${textColor}25`,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {text || 'Chapter Name'}
          </span>
        )}
        {/* Glowing underline */}
        <div style={{
          width: '100%', height: 2, marginTop: 2, borderRadius: 1,
          background: `linear-gradient(90deg, transparent, ${borderColor}, ${borderColor}, transparent)`,
          boxShadow: `0 0 8px ${borderColor}60, 0 2px 12px ${borderColor}30`,
        }} />
      </div>

      {/* Controls — visible when selected (not just editing) */}
      {showControls && (
        <div
          style={{ position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'all' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowPicker(v => !v)}
            style={{ width: 16, height: 16, borderRadius: '50%', background: textColor, border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
            title="Change style"
          />
          <button
            onClick={() => onEditComplete({ fontWeight: fontWeight === 'bold' ? 'normal' : 'bold' })}
            style={{ padding: '0 4px', borderRadius: 3, border: '1px solid', borderColor: fontWeight === 'bold' ? '#3b82f6' : '#555', background: fontWeight === 'bold' ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.5)', color: fontWeight === 'bold' ? '#60a5fa' : '#999', cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}
          >B</button>
          <button
            onClick={() => { const sizes = [16,20,24,28,32,36,42,48,56,64]; const idx = sizes.indexOf(fontSize); if (idx > 0) onEditComplete({ fontSize: sizes[idx-1] }); }}
            style={{ padding: '0 3px', borderRadius: 3, border: '1px solid #555', background: 'rgba(0,0,0,0.5)', color: '#999', cursor: 'pointer', fontSize: 9 }}
          >−</button>
          <span style={{ fontSize: 9, color: '#ccc', minWidth: 24, textAlign: 'center' }}>{fontSize}</span>
          <button
            onClick={() => { const sizes = [16,20,24,28,32,36,42,48,56,64]; const idx = sizes.indexOf(fontSize); if (idx < sizes.length-1) onEditComplete({ fontSize: sizes[idx+1] }); }}
            style={{ padding: '0 3px', borderRadius: 3, border: '1px solid #555', background: 'rgba(0,0,0,0.5)', color: '#999', cursor: 'pointer', fontSize: 9 }}
          >+</button>
        </div>
      )}

      {/* Color picker popup — stays open even when not editing */}
      {showPicker && showControls && (
        <div
          style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 28, zIndex: 50, background: '#1a1a2e', border: '1px solid #191C20', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 150, pointerEvents: 'all' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500 }}>Text</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 140 }}>
            {TEXT_COLORS.map(c => (
              <button key={`t-${c}`} onClick={() => onEditComplete({ textColor: c })} style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: textColor === c ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', boxShadow: textColor === c ? '0 0 6px rgba(59,130,246,0.5)' : 'none' }} />
            ))}
          </div>
          <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500, marginTop: 4 }}>Border</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 140 }}>
            {BORDER_COLORS.map(c => (
              <button key={`b-${c}`} onClick={() => onEditComplete({ borderColor: c })} style={{ width: 20, height: 20, borderRadius: '50%', background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50%/8px 8px' : c, border: borderColor === c ? '2px solid #3b82f6' : '2px solid rgba(255,255,255,0.15)', cursor: 'pointer', boxShadow: borderColor === c ? '0 0 6px rgba(59,130,246,0.5)' : 'none' }} />
            ))}
          </div>
          <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500, marginTop: 4 }}>Step</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['preload', 'animate'].map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                <input type="radio" name={`chapter-mode-${shape.id}`} checked={mode === m} onChange={() => onEditComplete({ mode: m })} style={{ width: 10, height: 10, accentColor: '#3b82f6' }} />
                <span style={{ fontSize: 8, color: '#94a3b8', textTransform: 'capitalize' }}>{m}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shape Util ──────────────────────────────────────────────────────────────

export class ChapterNameShapeUtil extends ShapeUtil<IChapterNameShape> {
  static override type = CHAPTER_NAME_TYPE;
  static override props: RecordProps<IChapterNameShape> = {
    w: T.number,
    h: T.number,
    text: T.string,
    fontSize: T.number,
    fontWeight: T.string,
    textColor: T.string,
    borderColor: T.string,
    mode: T.string,
  };

  getDefaultProps(): IChapterNameShape['props'] {
    return {
      w: 500,
      h: 60,
      text: '',
      fontSize: 32,
      fontWeight: 'bold',
      textColor: '#e2e8f0',
      borderColor: '#3b82f6',
      mode: 'animate',
    };
  }

  override canEdit() { return true; }
  override canResize() { return true; }
  override isAspectRatioLocked() { return false; }

  getGeometry(shape: IChapterNameShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: any, info: TLResizeInfo<any>) {
    return resizeBox(shape, info);
  }

  component(shape: IChapterNameShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const isSelected = this.editor.getSelectedShapeIds().includes(shape.id);

    return (
      <HTMLContainer style={{ pointerEvents: isEditing ? 'all' : 'auto', overflow: 'visible' }}>
        <ChapterNameView
          shape={shape}
          isEditing={isEditing}
          isSelected={isSelected}
          onEditComplete={(updates) => {
            this.editor.updateShape<IChapterNameShape>({
              id: shape.id,
              type: CHAPTER_NAME_TYPE,
              props: { ...shape.props, ...updates },
            });
          }}
        />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: IChapterNameShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 4);
    return path;
  }
}
