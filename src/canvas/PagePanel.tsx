/**
 * PagePanel — Custom page management panel for the right sidebar.
 * Shows when SubTopicTracker is collapsed (unlocked mode).
 * Lists all tldraw pages, allows create, delete, duplicate, rename, switch.
 */

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Copy, FileText } from 'lucide-react';
import type { Editor } from 'tldraw';

interface PagePanelProps {
  editor: Editor | null;
  isLocked: boolean;
  onShowTopics?: () => void;
}

interface PageInfo {
  id: string;
  name: string;
  index: string;
  shapeCount: number;
  isCurrent: boolean;
}

export default function PagePanel({ editor, isLocked, onShowTopics }: PagePanelProps) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Poll pages every 500ms
  useEffect(() => {
    if (!editor || isLocked) return;
    const refresh = () => {
      const allPages = editor.getPages();
      const currentId = editor.getCurrentPageId() as string;
      const infos: PageInfo[] = allPages.map(p => ({
        id: p.id as string,
        name: p.name || 'Untitled',
        index: (p as any).index || '',
        shapeCount: [...editor.getPageShapeIds(p.id)].length,
        isCurrent: (p.id as string) === currentId,
      }));
      setPages(infos);
    };
    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [editor, isLocked]);

  const switchPage = useCallback((pageId: string) => {
    if (!editor) return;
    editor.setCurrentPage(pageId as any);
  }, [editor]);

  const createPage = useCallback(() => {
    if (!editor) return;
    editor.createPage({ name: `Page ${pages.length + 1}` });
  }, [editor, pages.length]);

  const deletePage = useCallback((pageId: string) => {
    if (!editor) return;
    if (pages.length <= 1) return; // Can't delete last page
    if (!window.confirm('Delete this page and all its shapes?')) return;
    editor.deletePage(pageId as any);
  }, [editor, pages.length]);

  const duplicatePage = useCallback((pageId: string) => {
    if (!editor) return;
    editor.duplicatePage(pageId as any);
  }, [editor]);

  const startRename = useCallback((page: PageInfo) => {
    setEditingId(page.id);
    setEditName(page.name);
  }, []);

  const saveRename = useCallback(() => {
    if (!editor || !editingId || !editName.trim()) return;
    editor.renamePage(editingId as any, editName.trim());
    setEditingId(null);
    setEditName('');
  }, [editor, editingId, editName]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  if (isLocked) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-cyan-400/15 bg-cyan-500/8">
        <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          Pages
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-cyan-500/60">{pages.length}</span>
          <button
            onClick={createPage}
            className="p-1 bg-white/20 text-white rounded hover:bg-white/30 transition-colors"
            title="Create new page"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onShowTopics && (
            <button
              onClick={onShowTopics}
              className="p-1 bg-white/10 text-indigo-300 rounded hover:bg-white/20 transition-colors"
              title="Show Topics"
            >
              📋
            </button>
          )}
        </div>
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {pages.map((page, i) => (
          <div
            key={page.id}
            onClick={() => switchPage(page.id)}
            className={`rounded-lg px-2.5 py-2 cursor-pointer transition-all ${
              page.isCurrent
                ? 'bg-cyan-500/15 border border-cyan-400/40 shadow-sm shadow-cyan-500/10'
                : 'bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Page number */}
              <span className={`text-[9px] font-bold ${page.isCurrent ? 'text-cyan-400' : 'text-slate-600'}`}>
                {String(i + 1).padStart(2, '0')}
              </span>

              {/* Name — editable on double-click */}
              {editingId === page.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename();
                      if (e.key === 'Escape') cancelRename();
                      e.stopPropagation();
                    }}
                    onBlur={saveRename}
                    autoFocus
                    className="flex-1 min-w-0 text-[10px] font-medium bg-slate-900/80 text-cyan-200 border border-cyan-500/30 rounded px-1.5 py-0.5 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : (
                <span
                  className={`text-[10px] font-medium truncate flex-1 ${page.isCurrent ? 'text-cyan-200' : 'text-slate-400'}`}
                  onDoubleClick={(e) => { e.stopPropagation(); startRename(page); }}
                  title="Double-click to rename"
                >
                  {page.name}
                </span>
              )}

              {/* Shape count */}
              <span className={`text-[8px] ${page.isCurrent ? 'text-cyan-500/60' : 'text-slate-600'}`}>
                {page.shapeCount}
              </span>
            </div>

            {/* Action buttons — always visible */}
            {editingId !== page.id && (
              <div className="flex items-center gap-1 mt-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); startRename(page); }}
                  className="text-[8px] text-cyan-400/60 hover:text-cyan-300 px-1.5 py-0.5 rounded hover:bg-cyan-500/10 transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); duplicatePage(page.id); }}
                  className="text-[8px] text-blue-400/60 hover:text-blue-300 px-1.5 py-0.5 rounded hover:bg-blue-500/10 transition-colors flex items-center gap-0.5"
                >
                  <Copy className="w-2.5 h-2.5" /> Duplicate
                </button>
                {pages.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                    className="text-[8px] text-red-400/60 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors ml-auto"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5 border-t border-slate-700/30 text-[9px] text-slate-600 text-center">
        Double-click to rename
      </div>
    </div>
  );
}
