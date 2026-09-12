import { useCallback, useEffect, useRef } from 'react';
import { Tldraw, getSnapshot, loadSnapshot } from 'tldraw';
import type { Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { CodeBlockShapeUtil } from './shapes/CodeBlockShape';
import { MarkdownBlockShapeUtil } from './shapes/MarkdownBlockShape';

const customShapeUtils = [CodeBlockShapeUtil, MarkdownBlockShapeUtil];

interface CanvasEditorProps {
  snapshot: unknown | null;
  onEditorReady: (editor: Editor) => void;
  onSnapshotChange: (snapshot: unknown) => void;
  onSeedCanvas?: (editor: Editor) => void;
  hideUi?: boolean;
}

export default function CanvasEditor({
  snapshot,
  onEditorReady,
  onSnapshotChange,
  onSeedCanvas,
  hideUi = false,
}: CanvasEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // Auto-save on changes (throttled)
    const handleChange = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        if (editorRef.current) {
          const { document } = getSnapshot(editorRef.current.store);
          onSnapshotChange({ document });
        }
      }, 1000);
    };

    editor.store.listen(handleChange, { scope: 'document' });
  }, [snapshot, onEditorReady, onSnapshotChange]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="w-full h-full">
      <Tldraw
        onMount={handleMount}
        hideUi={hideUi}
        shapeUtils={customShapeUtils}
        components={{ PageMenu: null, MainMenu: null, QuickActions: null, ActionsMenu: null, HelpMenu: null }}
      />
    </div>
  );
}
