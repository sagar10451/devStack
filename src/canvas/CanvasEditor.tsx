import { useCallback, useRef, memo } from 'react';
import { Tldraw, loadSnapshot } from 'tldraw';
import type { Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { CodeBlockShapeUtil } from './shapes/CodeBlockShape';
import { MarkdownBlockShapeUtil } from './shapes/MarkdownBlockShape';
import { GlowNotesShapeUtil } from './shapes/GlowNotesShape';
import { StickyNoteShapeUtil } from './shapes/StickyNoteShape';
import { ChapterNameShapeUtil } from './shapes/ChapterNameShape';
import { IntroShapeUtil, IntroPlaybackContext } from './intro/IntroShape';
import { INTRO_EDITING, type IntroPlayback } from './intro/playback';

const customShapeUtils = [CodeBlockShapeUtil, MarkdownBlockShapeUtil, GlowNotesShapeUtil, StickyNoteShapeUtil, ChapterNameShapeUtil, IntroShapeUtil];

interface CanvasEditorProps {
  snapshot: unknown | null;
  onEditorReady: (editor: Editor) => void;
  onDocumentChange: () => void;
  onSeedCanvas?: (editor: Editor) => void;
  hideUi?: boolean;
  onLoadError?: (error: Error) => void;
  introPlayback?: IntroPlayback;
}

export default memo(function CanvasEditor({
  snapshot,
  onEditorReady,
  onDocumentChange,
  onSeedCanvas,
  hideUi = false,
  onLoadError,
  introPlayback = INTRO_EDITING,
}: CanvasEditorProps) {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Load existing snapshot if provided
    if (snapshot) {
      try {
        loadSnapshot(editor.store, snapshot as Parameters<typeof loadSnapshot>[1]);
      } catch (e) {
        if (onLoadError) { onLoadError(e as Error); return; }
        console.warn('Failed to load snapshot:', e);
      }
    }

    onEditorReady(editor);

    // Seed canvas if empty and seed function provided
    if (onSeedCanvas && editor.getCurrentPageShapeIds().size === 0) {
      onSeedCanvas(editor);
    }

    // Lightweight change listener — just marks dirty, no serialization
    return editor.store.listen(onDocumentChange, { scope: 'document' });
  }, [snapshot, onEditorReady, onDocumentChange, onSeedCanvas, onLoadError]);

  return (
    <div className="w-full h-full">
      <IntroPlaybackContext.Provider value={introPlayback}><Tldraw
        onMount={handleMount}
        hideUi={hideUi}
        shapeUtils={customShapeUtils}
        colorScheme="dark"
        components={{ PageMenu: null, MainMenu: null, QuickActions: null, ActionsMenu: null, HelpMenu: null }}
      /></IntroPlaybackContext.Provider>
    </div>
  );
});
