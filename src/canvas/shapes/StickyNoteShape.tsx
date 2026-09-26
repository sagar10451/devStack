/**
 * Custom tldraw shape: Sticky Note
 * Clean minimal Post-it style inspired by codepen.io/dillonbrady/pen/EgRoZQ
 * Used as helper/rough-mode notes — hidden in Main mode, visible in Rough mode.
 * Double-click to edit text content.
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

// ─── Shape type registration ─────────────────────────────────────────────────

const STICKY_NOTE_TYPE = 'sticky-note' as const;

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [STICKY_NOTE_TYPE]: {
      w: number;
      h: number;
      content: string;
    };
  }
}

type IStickyNoteShape = TLShape<typeof STICKY_NOTE_TYPE>;

// ─── Sticky Note View Component ──────────────────────────────────────────────

function StickyNoteView({
  shape,
  isEditing,
  isLocked,
  onEditComplete,
  onDelete,
}: {
  shape: IStickyNoteShape;
  isEditing: boolean;
  isLocked: boolean;
  onEditComplete: (content: string) => void;
  onDelete: () => void;
}) {
  const { content, w, h } = shape.props;
  const [editContent, setEditContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      setEditContent(content);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isEditing, content]);

  const handleSave = useCallback(() => {
    onEditComplete(editContent);
  }, [editContent, onEditComplete]);

  return (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
      }}
    >
      {/* Pin — shaft + red head */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          transform: 'translateX(-50%)',
          zIndex: 10,
          pointerEvents: 'none',
          width: 2,
          height: 20,
          background: '#aaa',
        }}
      >
        {/* Pin head — glossy red sphere */}
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: -5,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#AA3311',
            backgroundImage: 'radial-gradient(25% 25%, circle, hsla(0,0%,100%,.3), hsla(0,0%,0%,.3))',
            boxShadow:
              'inset 0 0 0 1px hsla(0,0%,0%,.1), ' +
              'inset 3px 3px 3px hsla(0,0%,100%,.2), ' +
              'inset -3px -3px 3px hsla(0,0%,0%,.2), ' +
              '23px 20px 3px hsla(0,0%,0%,.15)',
          }}
        />
      </div>

      {/* Note body */}
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#eae672',
          boxShadow: '0 10px 10px 2px rgba(0,0,0,0.3)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* X delete button — top right, only when unlocked */}
        {!isEditing && !isLocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'rgba(120, 40, 40, 0.7)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1,
              zIndex: 20,
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
            title="Remove sticky note"
          >
            ✕
          </button>
        )}

        {/* Content area */}
        {isEditing ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Edit toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
                background: 'rgba(0, 0, 0, 0.03)',
              }}
            >
              <span style={{ fontSize: 11, color: '#555', fontWeight: 700, fontFamily: 'Satisfy, cursive, sans-serif' }}>Sticky Note</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleSave}
                style={{
                  background: '#AA3311',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '3px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              placeholder="Write your note here..."
              style={{
                flex: 1,
                background: 'transparent',
                color: '#333',
                border: 'none',
                outline: 'none',
                resize: 'none',
                padding: '16px 20px',
                fontSize: Math.max(14, Math.min(22, w / 14)),
                lineHeight: 1.6,
                fontFamily: "'Satisfy', 'Patrick Hand', cursive, sans-serif",
                fontWeight: 400,
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              padding: '20px',
              overflow: 'auto',
              color: '#333',
              fontSize: Math.max(14, Math.min(22, w / 14)),
              lineHeight: 1.6,
              fontFamily: "'Satisfy', 'Patrick Hand', cursive, sans-serif",
              fontWeight: 400,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {content || (
              <span style={{ color: 'rgba(0, 0, 0, 0.25)', fontStyle: 'italic' }}>
                Double-click to write...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shape Util ──────────────────────────────────────────────────────────────

export class StickyNoteShapeUtil extends ShapeUtil<IStickyNoteShape> {
  static override type = STICKY_NOTE_TYPE;
  static override props: RecordProps<IStickyNoteShape> = {
    w: T.number,
    h: T.number,
    content: T.string,
  };

  getDefaultProps(): IStickyNoteShape['props'] {
    return {
      w: 280,
      h: 280,
      content: '',
    };
  }

  override canEdit() {
    return true;
  }
  override canResize() {
    return true;
  }
  override isAspectRatioLocked() {
    return false;
  }

  getGeometry(shape: IStickyNoteShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: any, info: TLResizeInfo<any>) {
    return resizeBox(shape, info);
  }

  component(shape: IStickyNoteShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    const isReadonly = this.editor.getInstanceState().isReadonly;
    const editor = this.editor;

    return (
      <HTMLContainer style={{ pointerEvents: isEditing ? 'all' : 'auto' }}>
        <StickyNoteView
          shape={shape}
          isEditing={isEditing}
          isLocked={isReadonly}
          onEditComplete={(content) => {
            editor.updateShape<IStickyNoteShape>({
              id: shape.id,
              type: STICKY_NOTE_TYPE,
              props: { ...shape.props, content },
            });
            editor.setEditingShape(null);
          }}
          onDelete={() => {
            editor.deleteShape(shape.id);
          }}
        />
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: IStickyNoteShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 2);
    return path;
  }
}
