import { useCallback, useRef, memo } from 'react';
import { Tldraw, loadSnapshot } from 'tldraw';
import type { Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { CodeBlockShapeUtil } from './shapes/CodeBlockShape';
import { MarkdownBlockShapeUtil } from './shapes/MarkdownBlockShape';
import { GlowNotesShapeUtil } from './shapes/GlowNotesShape';
import { StickyNoteShapeUtil } from './shapes/StickyNoteShape';
import { ChapterNameShapeUtil } from './shapes/ChapterNameShape';

const customShapeUtils = [CodeBlockShapeUtil, MarkdownBlockShapeUtil, GlowNotesShapeUtil, StickyNoteShapeUtil, ChapterNameShapeUtil];

interface CanvasEditorProps {
  snapshot: unknown | null;
  onEditorReady: (editor: Editor) => void;
  onDocumentChange: () => void;
  onSeedCanvas?: (editor: Editor) => void;
  hideUi?: boolean;
}

export default memo(function CanvasEditor({
  snapshot,
  onEditorReady,
  onDocumentChange,
  onSeedCanvas,
  hideUi = false,
}: CanvasEditorProps) {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Load existing snapshot if provided
    if (snapshot) {
      try {
        loadSnapshot(editor.store, snapshot as Parameters<typeof loadSnapshot>[1]);
      } catch (e) {
        console.warn('Failed to load snapshot:', e);
      }
    }

    onEditorReady(editor);

    // Seed canvas if empty and seed function provided
    if (onSeedCanvas && editor.getCurrentPageShapeIds().size === 0) {
      onSeedCanvas(editor);
    }

    // Lightweight change listener — just marks dirty, no serialization
    editor.store.listen(onDocumentChange, { scope: 'document' });
  }, [snapshot, onEditorReady, onDocumentChange]);

  return (
    <div className="w-full h-full">
      <Tldraw
        onMount={handleMount}
        hideUi={hideUi}
        shapeUtils={customShapeUtils}
        colorScheme="dark"
        components={{ PageMenu: null, MainMenu: null, QuickActions: null, ActionsMenu: null, HelpMenu: null, Watermark: null }}
      />
    </div>
  );
});
