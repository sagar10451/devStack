import { useState, useCallback, useEffect, useRef } from 'react';
import { getSnapshot, loadSnapshot } from 'tldraw';
import type { Editor } from 'tldraw';
import { Lock, Unlock, Save, ArrowLeft, ChevronLeft, ChevronRight, Download, Upload, Palette, Boxes, Code2, FileText, Eye, ImageDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import CanvasEditor from './CanvasEditor';
import { createSampleOOPLesson } from './sampleLesson';
import type { AnimationStep, AnimationType, StepAction, SubTopicLabel, LessonCanvasData, ShapeAnimationConfig } from './types';
import SubTopicTracker from './SubTopicTracker';
import { applyIdleAnimation } from './animationEngine';
import { applyStepAnimation, clearStepAnimations, applyExitAnimation, applyBlinkAnimation, applyMoveAnimation, applyTeleportAnimation, rewindMoveRecords, applyZoomToShapes, rewindZoom } from './stepAnimations';
import type { MoveRecord } from './stepAnimations';
import { usePresentation } from '../data/presentationContext';
import LaserPointer from '../components/LaserPointer';
import DiagramEditor from './diagram/DiagramEditor';
import DiagramToolbar from './diagram/DiagramToolbar';
import DraggableWidget from './DraggableWidget';
import NodeCatalog from './diagram/NodeCatalog';
import { EMPTY_DIAGRAM } from './diagram/diagramTypes';
import TimelineBar from './TimelineBar';
import type { DiagramData } from './diagram/diagramTypes';
import './diagram/diagramStyles.css';
import PublicMarkdownEditor from './PublicMarkdownEditor';
import type { PublicCanvasData } from './types';

/** Check if an ID belongs to a React Flow element (node or edge) vs a tldraw shape.
 *  Tldraw IDs contain ':' (e.g. 'shape:xxx'). RF IDs don't. */
const isRfId = (id: string) => !id.includes(':');
const isTldrawId = (id: string) => id.includes(':');

/**
 * DropZone — only appears during drag operations from the node catalog.
 * Uses document-level dragenter/dragleave to show/hide itself,
 * so it never interferes with tldraw when not dragging.
 */
function DropZone({ onNodeDrop, editor: dropEditor }: { onNodeDrop: (pending: { item: any; position: { x: number; y: number } }) => void; editor: any }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const dragCountRef = useRef(0);

  useEffect(() => {
    // Track drag enter/leave on the document to know when a drag is active
    const handleDragEnter = () => {
      dragCountRef.current++;
      setVisible(true);
    };
    const handleDragLeave = () => {
      dragCountRef.current--;
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0;
        setVisible(false);
      }
    };
    const handleDragEnd = () => {
      dragCountRef.current = 0;
      setVisible(false);
    };
    const handleDrop = () => {
      dragCountRef.current = 0;
      setVisible(false);
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragend', handleDragEnd);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragend', handleDragEnd);
      document.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };

    const handleElDrop = (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer?.getData('application/json');
      if (!raw) return;
      try {
        const item = JSON.parse(raw);
        // Convert screen coords to canvas coords
        if (dropEditor?.screenToPage) {
          const pagePoint = dropEditor.screenToPage({ x: e.clientX, y: e.clientY });
          onNodeDrop({ item, position: { x: pagePoint.x - 60, y: pagePoint.y - 40 } });
        } else {
          const rect = el.getBoundingClientRect();
          onNodeDrop({ item, position: { x: e.clientX - rect.left - 60, y: e.clientY - rect.top - 40 } });
        }
      } catch { /* ignore */ }
    };

    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleElDrop);
    return () => {
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleElDrop);
    };
  }, [onNodeDrop]);

  return <div ref={ref} className="absolute inset-0 z-[5]" style={{ pointerEvents: visible ? 'auto' : 'none' }} />;
}

interface LessonCanvasProps {
  topicSlug: string;
  subtopicSlug: string;
  topicTitle: string;
  subtopicTitle: string;
  initialData: LessonCanvasData | null;
  siteId: string;
  watermark: string;
  backPath: string;
}

export default function LessonCanvas({
  topicSlug,
  subtopicSlug,
  topicTitle,
  subtopicTitle,
  initialData,
  siteId,
  backPath,
}: LessonCanvasProps) {
  const { isPresenting, presentationTool } = usePresentation();
  const [isLocked, setIsLocked] = useState(true);
  const [showPublicCanvas, setShowPublicCanvas] = useState(false);
  const [publicCanvasData, setPublicCanvasData] = useState<PublicCanvasData | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [snapshot, setSnapshot] = useState<unknown>(initialData?.snapshot || null);
  const [animationSteps, setAnimationSteps] = useState<AnimationStep[]>(initialData?.animationSteps || []);
  const [subTopicLabels, setSubTopicLabels] = useState<SubTopicLabel[]>(initialData?.subTopicLabels || []);
  const [sidebarTitle, setSidebarTitle] = useState('Outline');
  const [shapeAnimations, setShapeAnimations] = useState<Record<string, ShapeAnimationConfig>>(initialData?.shapeAnimations || {});
  const [currentStep, setCurrentStep] = useState(-1);
  const [showAnimBar, setShowAnimBar] = useState(false);
  const [showLineConfig, setShowLineConfig] = useState(false);
  const [showNodes, setShowNodes] = useState(false);
  const [pendingNode, setPendingNode] = useState<{ item: any; position: { x: number; y: number } } | null>(null);
  const [pickingDestinationForStep, setPickingDestinationForStep] = useState<string | null>(null);
  const [pickOriginalPosition, setPickOriginalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [hideLockButton, setHideLockButton] = useState(false);
  const [tldrawCamera, setTldrawCamera] = useState<{ x: number; y: number; z: number } | null>(null);

  // ─── Diagram (React Flow) state ──────────────────────────────────────────
  const [diagramData, setDiagramData] = useState<DiagramData>(
    (initialData?.diagramData as DiagramData) || { ...EMPTY_DIAGRAM }
  );
  const [rfEdgeType, setRfEdgeType] = useState(diagramData.edgeType);
  const [rfPathType, setRfPathType] = useState(diagramData.pathType);
  const [rfArrowType, setRfArrowType] = useState(diagramData.arrowType);
  const [rfColor, setRfColor] = useState(diagramData.color);
  const [rfSelectedNodeIds, setRfSelectedNodeIds] = useState<string[]>([]);
  const [rfSelectedEdgeIds, setRfSelectedEdgeIds] = useState<string[]>([]);
  const diagramWrapperRef = useRef<HTMLDivElement>(null);
  const moveOriginalPositionsRef = useRef<Record<string, MoveRecord[]>>({});
  const zoomSavedCamerasRef = useRef<Record<string, { x: number; y: number; z: number }>>({});
  const presentationStartCameraRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const editingCameraRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const stepAudioRef = useRef<HTMLAudioElement | null>(null);
  const stepAudioTimerRef = useRef<number | null>(null);

  const handleRfSelectionChange = useCallback((nodeIds: string[], edgeIds: string[]) => {
    setRfSelectedNodeIds(nodeIds);
    setRfSelectedEdgeIds(edgeIds);
  }, []);

  const handleDiagramChange = useCallback((data: DiagramData) => {
    setDiagramData(data);
    setIsSaved(false);
  }, []);

  const handleRfFlip = useCallback(() => {
    const wrapper = diagramWrapperRef.current?.querySelector('.rf-diagram-wrapper') as HTMLElement & { __flipEdges?: () => void } | null;
    if (wrapper?.__flipEdges) wrapper.__flipEdges();
  }, []);

  // ─── Load public canvas data from localStorage ────────────────────────────
  useEffect(() => {
    const key = `public-canvas-${siteId}-${topicSlug}-${subtopicSlug}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try { setPublicCanvasData(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, [siteId, topicSlug, subtopicSlug]);

  // ─── tldraw callbacks ────────────────────────────────────────────────────
  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
    setTimeout(() => {
      // Restore saved camera position
      if (initialData?.camera) {
        ed.setCamera(initialData.camera);
      }
      applyAnimationState(ed, animationSteps, -1);
      ed.updateInstanceState({ isReadonly: true });
      setCanvasReady(true);
    }, 50);
  }, [animationSteps, initialData]);

  // Re-apply animation state for RF elements after they mount (initial page load)
  // Track tldraw camera for RF viewport sync
  useEffect(() => {
    if (!editor) return;
    const updateCamera = () => {
      const cam = editor.getCamera();
      setTldrawCamera({ x: cam.x, y: cam.y, z: cam.z });
    };
    updateCamera();
    const unsub = editor.store.listen(updateCamera, { scope: 'session' });
    return () => unsub();
  }, [editor]);

  // Track selected shape IDs for timeline highlighting
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  useEffect(() => {
    if (!editor || isLocked) return;
    const updateSelection = () => {
      const tldrawIds = editor.getSelectedShapeIds() as string[];
      // Merge tldraw + RF selections so timeline cards highlight for both
      setSelectedShapeIds([...tldrawIds, ...rfSelectedNodeIds, ...rfSelectedEdgeIds]);
    };
    updateSelection();
    const unsub = editor.store.listen(updateSelection, { scope: 'session' });
    return () => unsub();
  }, [editor, isLocked, rfSelectedNodeIds, rfSelectedEdgeIds]);

  const applyAnimationState = useCallback((_ed: Editor, steps: AnimationStep[], upToStep: number) => {
    if (steps.length === 0) return;

    const visibilitySteps = steps.filter(s => (s.action || 'enter') !== 'none');

    // Hide all tldraw animated shapes via CSS
    const allAnimatedIds = new Set(visibilitySteps.flatMap(s => s.shapeIds).filter(isTldrawId));
    allAnimatedIds.forEach(shapeId => {
      const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
      if (el) {
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
      }
    });

    // Hide all RF animated elements via class
    const allRfIds = new Set(visibilitySteps.flatMap(s => s.shapeIds).filter(isRfId));
    allRfIds.forEach(rfId => {
      const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
      if (el) { el.classList.add('rf-anim-hidden'); el.classList.remove('rf-anim-visible'); }
    });

    // Also hide exit shape IDs from swap steps
    const allExitIds = new Set(steps.flatMap(s => s.exitShapeIds || []).filter(isTldrawId));
    allExitIds.forEach(shapeId => {
      const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
      if (el) {
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
      }
    });
    const allRfExitIds = new Set(steps.flatMap(s => s.exitShapeIds || []).filter(isRfId));
    allRfExitIds.forEach(rfId => {
      const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
      if (el) { el.classList.add('rf-anim-hidden'); el.classList.remove('rf-anim-visible'); }
    });

    // Show/hide up to the given step
    for (let i = 0; i <= upToStep && i < steps.length; i++) {
      const stepAction = steps[i].action || 'enter';
      if (stepAction === 'none') continue;

      if (stepAction === 'exit') {
        steps[i].shapeIds.filter(isTldrawId).forEach(shapeId => {
          const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
          if (el) { el.style.visibility = 'hidden'; el.style.opacity = '0'; }
        });
        steps[i].shapeIds.filter(isRfId).forEach(rfId => {
          const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
          if (el) { el.classList.add('rf-anim-hidden'); el.classList.remove('rf-anim-visible'); }
        });
      } else if (stepAction === 'swap') {
        steps[i].shapeIds.filter(isTldrawId).forEach(shapeId => {
          const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
          if (el) { el.style.visibility = 'visible'; el.style.opacity = '1'; }
        });
        steps[i].shapeIds.filter(isRfId).forEach(rfId => {
          const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
          if (el) { el.classList.remove('rf-anim-hidden'); el.classList.add('rf-anim-visible'); }
        });
        (steps[i].exitShapeIds || []).filter(isTldrawId).forEach(shapeId => {
          const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
          if (el) { el.style.visibility = 'hidden'; el.style.opacity = '0'; }
        });
        (steps[i].exitShapeIds || []).filter(isRfId).forEach(rfId => {
          const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
          if (el) { el.classList.add('rf-anim-hidden'); el.classList.remove('rf-anim-visible'); }
        });
      } else {
        steps[i].shapeIds.filter(isTldrawId).forEach(shapeId => {
          const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
          if (el) { el.style.visibility = 'visible'; el.style.opacity = '1'; }
        });
        steps[i].shapeIds.filter(isRfId).forEach(rfId => {
          const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
          if (el) { el.classList.remove('rf-anim-hidden'); el.classList.add('rf-anim-visible'); }
        });
      }
    }
  }, []);

  // Called when DiagramEditor's React Flow is initialized — RF nodes are now in DOM
  const handleDiagramReady = useCallback(() => {
    if (!editor || !isLocked || animationSteps.length === 0) return;
    setTimeout(() => {
      applyAnimationState(editor, animationSteps, currentStep);
    }, 50);
  }, [editor, isLocked, animationSteps, currentStep, applyAnimationState]);

  const handleSnapshotChange = useCallback((newSnapshot: unknown) => {
    setSnapshot(newSnapshot);
    setIsSaved(false);
  }, []);

  const handleStepsChange = useCallback((newSteps: AnimationStep[]) => {
    setAnimationSteps(newSteps);
    setIsSaved(false);
  }, []);

  // Watch for deleted shapes and clean up animation steps + sub-topic ranges
  useEffect(() => {
    if (!editor || isLocked) return;

    const cleanup = () => {
      const existingShapeIds = new Set(
        editor.getCurrentPageShapeIds() as Set<string>
      );

      const rfNodeIds = new Set(diagramData.nodes.map((n: any) => n.id as string));
      const rfEdgeIds = new Set(diagramData.edges.map((e: any) => e.id as string));

      const cleanedSteps = animationSteps
        .map(step => ({
          ...step,
          shapeIds: step.shapeIds.filter(id => {
            if (isRfId(id)) return rfNodeIds.has(id) || rfEdgeIds.has(id);
            return existingShapeIds.has(id);
          }),
        }))
        .filter(step => step.shapeIds.length > 0);

      if (cleanedSteps.length !== animationSteps.length) {
        setAnimationSteps(cleanedSteps);

        const maxStepIndex = cleanedSteps.length - 1;
        const adjustedLabels = subTopicLabels.map(label => ({
          ...label,
          startStep: Math.min(label.startStep, Math.max(0, maxStepIndex)),
          endStep: Math.min(label.endStep, Math.max(0, maxStepIndex)),
        }));
        setSubTopicLabels(adjustedLabels);

        const cleanedAnims: Record<string, ShapeAnimationConfig> = {};
        for (const [id, config] of Object.entries(shapeAnimations)) {
          if (existingShapeIds.has(id) || rfNodeIds.has(id) || rfEdgeIds.has(id)) {
            cleanedAnims[id] = config;
          }
        }
        setShapeAnimations(cleanedAnims);
        setIsSaved(false);
      }
    };

    const unsub = editor.store.listen(cleanup, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked, animationSteps, subTopicLabels, shapeAnimations, diagramData]);

  // ─── Auto-add new shapes to timeline ─────────────────────────────────────
  const knownShapeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!editor || isLocked) return;

    // Initialize known shapes
    const allShapes = editor.getCurrentPageShapes();
    knownShapeIdsRef.current = new Set(allShapes.map(s => s.id as string));

    const detectNewShapes = () => {
      const currentShapes = editor.getCurrentPageShapes();
      const currentIds = new Set(currentShapes.map(s => s.id as string));
      const newIds: string[] = [];

      for (const id of currentIds) {
        if (!knownShapeIdsRef.current.has(id)) {
          newIds.push(id);
        }
      }

      // Update known set
      knownShapeIdsRef.current = currentIds;

      if (newIds.length === 0) return;

      // Check if these shapes are already in a step
      const existingStepShapeIds = new Set(animationSteps.flatMap(s => s.shapeIds));
      const trulyNew = newIds.filter(id => !existingStepShapeIds.has(id));
      if (trulyNew.length === 0) return;

      const pageId = editor.getCurrentPageId() as string;

      // Auto-add each new shape as a step, tagged with current page
      const newSteps: AnimationStep[] = trulyNew.map((id, i) => ({
        id: `step-${Date.now()}-${i}`,
        shapeIds: [id],
        animation: 'appear' as AnimationType,
        duration: 800,
        label: `Step`,
        action: 'enter' as StepAction,
        pageId,
      }));

      // Insert at end of current page's section (not at end of entire array)
      setAnimationSteps(prev => {
        const lastPageIndex = prev.map(s => s.pageId).lastIndexOf(pageId);
        if (lastPageIndex === -1) {
          // No steps for this page yet — find insertion point by page order
          const pages = editor.getPages();
          const pageOrder = pages.map(p => p.id as string);
          const currentPageIdx = pageOrder.indexOf(pageId);
          // Insert after the last step of any page that comes before this one
          let insertAt = 0;
          for (let i = prev.length - 1; i >= 0; i--) {
            const stepPageIdx = pageOrder.indexOf(prev[i].pageId || pageOrder[0]);
            if (stepPageIdx < currentPageIdx) {
              insertAt = i + 1;
              break;
            }
          }
          const result = [...prev];
          result.splice(insertAt, 0, ...newSteps);
          return result;
        }
        const result = [...prev];
        result.splice(lastPageIndex + 1, 0, ...newSteps);
        return result;
      });
      setIsSaved(false);
    };

    const unsub = editor.store.listen(detectNewShapes, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked, animationSteps]);

  // ─── Auto-add new RF nodes/edges to timeline ──────────────────────────────
  const knownRfIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isLocked) return;

    // Get current RF node and edge IDs
    const currentRfIds = new Set([
      ...(diagramData.nodes as any[]).map((n: any) => n.id as string),
      ...(diagramData.edges as any[]).map((e: any) => e.id as string),
    ]);

    // Find new IDs
    const newRfIds: string[] = [];
    for (const id of currentRfIds) {
      if (!knownRfIdsRef.current.has(id)) {
        newRfIds.push(id);
      }
    }

    // Update known set
    knownRfIdsRef.current = currentRfIds;

    if (newRfIds.length === 0) return;

    // Check if already in a step
    const existingStepShapeIds = new Set(animationSteps.flatMap(s => s.shapeIds));
    const trulyNew = newRfIds.filter(id => !existingStepShapeIds.has(id));
    if (trulyNew.length === 0) return;

    // RF elements belong to the current page (RF overlay is per-page)
    const pageId = editor ? editor.getCurrentPageId() as string : 'page:page';

    // Auto-add each new RF element as a step
    const newSteps: AnimationStep[] = trulyNew.map((id, i) => ({
      id: `step-${Date.now()}-rf-${i}`,
      shapeIds: [id],
      animation: 'appear' as AnimationType,
      duration: 800,
      label: `Step`,
      action: 'enter' as StepAction,
      pageId,
    }));

    // Insert at end of current page's section
    setAnimationSteps(prev => {
      const lastPageIndex = prev.map(s => s.pageId).lastIndexOf(pageId);
      if (lastPageIndex === -1) {
        return [...prev, ...newSteps];
      }
      const result = [...prev];
      result.splice(lastPageIndex + 1, 0, ...newSteps);
      return result;
    });
    setIsSaved(false);
  }, [diagramData, isLocked, animationSteps, editor]);

  // ─── Page copy/delete listeners ───────────────────────────────────────────
  const knownPageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!editor) return;

    // Initialize known pages
    const pages = editor.getPages();
    knownPageIdsRef.current = new Set(pages.map(p => p.id as string));

    const handlePageChanges = () => {
      const currentPages = editor.getPages();
      const currentPageIds = new Set(currentPages.map(p => p.id as string));

      // Detect new pages (could be a duplicate)
      const newPageIds: string[] = [];
      for (const id of currentPageIds) {
        if (!knownPageIdsRef.current.has(id)) {
          newPageIds.push(id);
        }
      }

      // Detect deleted pages
      const deletedPageIds: string[] = [];
      for (const id of knownPageIdsRef.current) {
        if (!currentPageIds.has(id)) {
          deletedPageIds.push(id);
        }
      }

      knownPageIdsRef.current = currentPageIds;

      // Handle page deletion — remove orphaned timeline cards
      if (deletedPageIds.length > 0) {
        setAnimationSteps(prev => prev.filter(s => !deletedPageIds.includes(s.pageId || '')));
        setIsSaved(false);
      }

      // Handle page duplication — auto-create timeline cards for the new page
      if (newPageIds.length > 0) {
        for (const newPageId of newPageIds) {
          // Get shapes on the new page
          const newPageShapeIds = new Set(
            [...editor.getPageShapeIds(newPageId as any)].map(id => id as string)
          );
          if (newPageShapeIds.size === 0) continue; // Blank new page, nothing to copy

          // Find which existing page's steps match these shapes (by shape type/position similarity)
          // For duplicated pages, shape IDs are NEW but the shapes are copies.
          // We create new steps matching the order of the source page's steps.
          // The source page is the page that was current before duplication.
          // Since duplicatePage switches to the new page, the previous page is the source.
          const allPages = editor.getPages();
          const newPageIndex = allPages.findIndex(p => (p.id as string) === newPageId);
          // Source is typically the page just before the new one in order
          let sourcePageId: string | null = null;
          if (newPageIndex > 0) {
            sourcePageId = allPages[newPageIndex - 1].id as string;
          }

          if (sourcePageId) {
            setAnimationSteps(prev => {
              const sourceSteps = prev.filter(s => (s.pageId || '') === sourcePageId);
              if (sourceSteps.length === 0) return prev;

              // Map source shape IDs to new page shape IDs by matching position/type
              const sourceShapes = [...editor.getPageShapeIds(sourcePageId as any)]
                .map(id => editor.getShape(id))
                .filter(Boolean) as any[];
              const newShapes = [...editor.getPageShapeIds(newPageId as any)]
                .map(id => editor.getShape(id))
                .filter(Boolean) as any[];

              // Build a mapping: source shape ID → new shape ID (by matching type + position)
              const idMapping = new Map<string, string>();
              for (const srcShape of sourceShapes) {
                const match = newShapes.find((ns: any) =>
                  ns.type === srcShape.type &&
                  Math.abs(ns.x - srcShape.x) < 1 &&
                  Math.abs(ns.y - srcShape.y) < 1 &&
                  !idMapping.has(ns.id as string) &&
                  ![...idMapping.values()].includes(ns.id as string)
                );
                if (match) {
                  idMapping.set(srcShape.id as string, match.id as string);
                }
              }

              // Create new steps for the duplicated page
              const duplicatedSteps: AnimationStep[] = sourceSteps.map((step, i) => ({
                ...step,
                id: `step-${Date.now()}-dup-${i}`,
                pageId: newPageId,
                shapeIds: step.shapeIds.map(sid => idMapping.get(sid) || sid),
                // Clear camera position — user should set it fresh for the new page
                cameraPosition: undefined,
                // Clear audio — user re-adds if needed
                audio: undefined,
              }));

              // Insert after the source page's steps
              const lastSourceIndex = prev.map(s => s.pageId).lastIndexOf(sourcePageId!);
              const result = [...prev];
              result.splice(lastSourceIndex + 1, 0, ...duplicatedSteps);
              return result;
            });
            setIsSaved(false);
          }
        }
      }
    };

    const unsub = editor.store.listen(handlePageChanges, { scope: 'document' });
    return () => unsub();
  }, [editor]);

  const handleLabelsChange = useCallback((newLabels: SubTopicLabel[]) => {
    setSubTopicLabels(newLabels);
    setIsSaved(false);
  }, []);

  // ─── Build save data helper ──────────────────────────────────────────────
  const buildSaveData = useCallback((): LessonCanvasData => {
    const doc = editor ? getSnapshot(editor.store).document : (snapshot as any)?.document;
    const cam = editor?.getCamera();
    return {
      version: 2,
      meta: {
        topicSlug, subtopicSlug, title: subtopicTitle,
        createdAt: initialData?.meta.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      snapshot: doc ? { document: doc } : snapshot,
      camera: cam ? { x: cam.x, y: cam.y, z: cam.z } : undefined,
      animationSteps,
      subTopicLabels,
      shapeAnimations,
      diagramData,
    };
  }, [editor, snapshot, topicSlug, subtopicSlug, subtopicTitle, animationSteps, subTopicLabels, shapeAnimations, diagramData, initialData]);

  const [storageWarning, setStorageWarning] = useState(false);

  // Auto-save (strips audio data to keep localStorage small)
  useEffect(() => {
    if (!editor) return;
    const saveTimeout = setTimeout(() => {
      const data = buildSaveData();

      // Guard: don't save if tldraw has no shapes but timeline has steps
      // This prevents HMR/idle resets from wiping saved canvas data
      const doc = data.snapshot as any;
      const recordCount = doc?.document ? Object.keys(doc.document).length : 0;
      if (recordCount <= 2 && data.animationSteps && data.animationSteps.length > 0) {
        // Snapshot looks empty (only schema + metadata records) but steps exist — skip save
        return;
      }

      // Strip audio base64 data before saving — keep only config
      if (data.animationSteps) {
        data.animationSteps = data.animationSteps.map((s: any) => {
          if (s.audio?.data) {
            return { ...s, audio: { ...s.audio, data: '' } };
          }
          return s;
        });
      }
      const key = `lesson-canvas-${siteId}-${topicSlug}-${subtopicSlug}`;
      try {
        const json = JSON.stringify(data);
        localStorage.setItem(key, json);
        setIsSaved(true);
        setStorageWarning(false);
      } catch {
        // localStorage quota exceeded
        setStorageWarning(true);
        setIsSaved(false);
      }
    }, 1500);
    return () => clearTimeout(saveTimeout);
  }, [snapshot, animationSteps, subTopicLabels, shapeAnimations, diagramData, editor, siteId, topicSlug, subtopicSlug, buildSaveData]);

  // ─── Step audio helpers (Web Audio API for reliable volume control) ──────
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const stopStepAudio = useCallback(() => {
    if (stepAudioTimerRef.current) {
      cancelAnimationFrame(stepAudioTimerRef.current);
      stepAudioTimerRef.current = null;
    }
    if (stepAudioRef.current) {
      stepAudioRef.current.pause();
      stepAudioRef.current.currentTime = 0;
      stepAudioRef.current = null;
    }
    audioSourceRef.current = null;
    audioGainRef.current = null;
  }, []);

  const playStepAudio = useCallback((step: { audio?: { data: string; startTime: number; endTime: number; loop: boolean; volume: number } }) => {
    stopStepAudio();
    if (!step.audio || !step.audio.data) return;
    const { data, startTime, endTime, loop, volume } = step.audio;

    // Create AudioContext on first use (must be after user gesture)
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    const audio = new Audio(data);
    audio.currentTime = startTime;
    stepAudioRef.current = audio;

    // Connect: Audio Element → GainNode → Speakers
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain);
    gain.connect(ctx.destination);
    audioSourceRef.current = source;
    audioGainRef.current = gain;

    audio.play().catch(() => { /* autoplay blocked */ });

    const handleTimeUpdate = () => {
      if (audio.currentTime >= endTime) {
        if (loop) {
          audio.currentTime = startTime;
        } else {
          audio.pause();
          stepAudioRef.current = null;
          audioSourceRef.current = null;
          audioGainRef.current = null;
        }
      }
    };

    const handleEnded = () => {
      if (loop) {
        audio.currentTime = startTime;
        audio.play().catch(() => {});
      } else {
        stepAudioRef.current = null;
        audioSourceRef.current = null;
        audioGainRef.current = null;
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
  }, [stopStepAudio]);

  // Lock / Unlock
  const toggleLock = useCallback(() => {
    if (!editor) return;
    if (isLocked) {
      editor.updateInstanceState({ isReadonly: false });
      editor.getCurrentPageShapes().forEach(shape => {
        if (shape.opacity < 1) editor.updateShape({ id: shape.id, type: shape.type, opacity: 1 });
      });
      // Remove animation visibility classes from all RF elements
      document.querySelectorAll('.rf-anim-hidden, .rf-anim-visible').forEach(el => {
        el.classList.remove('rf-anim-hidden', 'rf-anim-visible');
      });
      // Remove CSS visibility overrides from all tldraw shapes
      document.querySelectorAll('[data-shape-id]').forEach(el => {
        (el as HTMLElement).style.visibility = '';
        (el as HTMLElement).style.opacity = '';
      });
      // Delete any move/teleport clones and restore originals
      for (const records of Object.values(moveOriginalPositionsRef.current)) {
        rewindMoveRecords(records, editor);
      }
      moveOriginalPositionsRef.current = {};
      zoomSavedCamerasRef.current = {};
      // Stop any playing audio
      stopStepAudio();
      // Restore camera to original editing position when unlocking
      if (editingCameraRef.current) {
        editor.setCamera(editingCameraRef.current, { force: true });
      }
      // Unlock tldraw camera
      editor.setCameraOptions({ isLocked: false });
      setIsLocked(false);
    } else {
      editor.updateInstanceState({ isReadonly: false });
      // Restore all saved move/teleport positions before locking
      for (const records of Object.values(moveOriginalPositionsRef.current)) {
        rewindMoveRecords(records, editor);
      }
      moveOriginalPositionsRef.current = {};
      zoomSavedCamerasRef.current = {};
      // Save exact editing camera — restored on unlock and used as presentation start
      const cam = editor.getCamera();
      editingCameraRef.current = { x: cam.x, y: cam.y, z: cam.z };
      presentationStartCameraRef.current = { x: cam.x, y: cam.y, z: cam.z };
      setCurrentStep(-1);
      applyAnimationState(editor, animationSteps, -1);
      // Re-apply after a frame to catch RF elements that might not be in DOM yet
      setTimeout(() => applyAnimationState(editor, animationSteps, -1), 100);
      editor.updateInstanceState({ isReadonly: true });
      // Lock tldraw camera to prevent any internal shifts during presentation
      editor.setCameraOptions({ isLocked: true });
      setIsLocked(true);
      setShowAnimBar(false);
      setShowNodes(false);
    }
  }, [isLocked, editor, animationSteps, applyAnimationState, stopStepAudio]);

  // Camera nudge — only for completely off-screen elements
  const ensureShapesVisible = useCallback((shapeIds: string[]) => {
    if (!editor) return;

    // Collect page-space bounding box of all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const shapeId of shapeIds.filter(isTldrawId)) {
      const bounds = editor.getShapePageBounds(shapeId as any);
      if (bounds) {
        minX = Math.min(minX, bounds.x); minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.w); maxY = Math.max(maxY, bounds.y + bounds.h);
      }
    }

    for (const rfId of shapeIds.filter(isRfId)) {
      const el = document.querySelector(`[data-id="${rfId}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const topLeft = editor.screenToPage({ x: rect.left, y: rect.top });
        const bottomRight = editor.screenToPage({ x: rect.right, y: rect.bottom });
        minX = Math.min(minX, topLeft.x); minY = Math.min(minY, topLeft.y);
        maxX = Math.max(maxX, bottomRight.x); maxY = Math.max(maxY, bottomRight.y);
      }
    }

    if (minX === Infinity) return;

    // Use tldraw's viewport page bounds (accounts for actual canvas area, not sidebar)
    const vp = editor.getViewportPageBounds();

    // Check if shape overlaps with viewport in page space
    const isVisible =
      maxX > vp.x &&
      minX < vp.x + vp.w &&
      maxY > vp.y &&
      minY < vp.y + vp.h;

    if (isVisible) return;

    // Completely off-screen — center on shape, offset left to account for sidebar
    const pageCenterX = (minX + maxX) / 2;
    const pageCenterY = (minY + maxY) / 2;
    editor.centerOnPoint({ x: pageCenterX, y: pageCenterY }, { force: true, animation: { duration: 300 } });
  }, [editor]);

  const goNext = useCallback(() => {
    if (!editor || !isLocked) return;
    if (currentStep >= animationSteps.length - 1) return;
    editor.stopCameraAnimation();
    const nextStep = currentStep + 1;
    const step = animationSteps[nextStep];
    const action = step.action || 'enter';

    switch (action) {
      case 'none': {
        break;
      }
      case 'enter': {
        applyAnimationState(editor, animationSteps, nextStep);
        applyStepAnimation(step.shapeIds, step.animation, step.duration);
        step.shapeIds.forEach(shapeId => {
          const config = shapeAnimations[shapeId];
          if (config?.idle && config.idle !== 'none') {
            applyIdleAnimation(shapeId, config.idle);
          }
        });
        break;
      }
      case 'exit': {
        applyExitAnimation(step.shapeIds, step.animation, step.duration, () => {
          applyAnimationState(editor, animationSteps, nextStep);
        });
        break;
      }
      case 'blink': {
        applyBlinkAnimation(step.shapeIds, step.duration);
        break;
      }
      case 'move': {
        if (step.targetPosition) {
          const records = applyMoveAnimation(step.shapeIds, step.targetPosition, step.duration, editor);
          moveOriginalPositionsRef.current[step.id] = records;
        }
        break;
      }
      case 'teleport': {
        if (step.targetPosition) {
          const records = applyTeleportAnimation(step.shapeIds, step.targetPosition, step.duration, editor);
          moveOriginalPositionsRef.current[step.id] = records;
        }
        break;
      }
      case 'swap': {
        applyAnimationState(editor, animationSteps, nextStep);
        applyStepAnimation(step.shapeIds, step.animation, step.duration);
        break;
      }
      default: {
        applyAnimationState(editor, animationSteps, nextStep);
        applyStepAnimation(step.shapeIds, step.animation, step.duration);
        break;
      }
    }

    // Camera movement — skip if already at the captured position
    if (step.cameraPosition) {
      const savedCam = applyZoomToShapes(step.shapeIds, step.duration, editor, step.cameraPosition);
      if (savedCam) {
        zoomSavedCamerasRef.current[step.id] = savedCam;
      }
    }

    playStepAudio(step);
    setCurrentStep(nextStep);
  }, [editor, isLocked, currentStep, animationSteps, shapeAnimations, ensureShapesVisible, applyAnimationState, playStepAudio]);

  const goPrevious = useCallback(() => {
    if (!editor || !isLocked) return;
    if (currentStep < 0) return;
    // Stop any in-progress camera animation to prevent overlap
    editor.stopCameraAnimation();
    // Stop any playing audio
    stopStepAudio();

    const step = animationSteps[currentStep];
    const action = step.action || 'enter';

    // Rewind move/teleport clones for this step
    if ((action === 'move' || action === 'teleport') && moveOriginalPositionsRef.current[step.id]) {
      rewindMoveRecords(moveOriginalPositionsRef.current[step.id], editor);
      delete moveOriginalPositionsRef.current[step.id];
    }

    // Rewind camera: restore saved camera if this step had a captured view
    if (step.cameraPosition && zoomSavedCamerasRef.current[step.id]) {
      rewindZoom(zoomSavedCamerasRef.current[step.id], editor);
      delete zoomSavedCamerasRef.current[step.id];
    }

    clearStepAnimations(step.shapeIds);

    if (currentStep === 0) {
      applyAnimationState(editor, animationSteps, -1);
      // Restore exact presentation start camera to prevent drift from accumulated nudges
      if (presentationStartCameraRef.current) {
        editor.setCamera(presentationStartCameraRef.current, { force: true });
      }
      setCurrentStep(-1);
    } else {
      const prevStep = currentStep - 1;
      applyAnimationState(editor, animationSteps, prevStep);
      setCurrentStep(prevStep);
    }
  }, [editor, isLocked, currentStep, animationSteps, applyAnimationState, stopStepAudio]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave(); return; }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') { e.preventDefault(); setHideLockButton(h => !h); return; }
      // Zoom shortcuts (work when unlocked too)
      if (e.shiftKey && e.key === '!') { e.preventDefault(); editor?.zoomToSelection({ force: true, animation: { duration: 300 } }); return; }
      if (e.shiftKey && e.key === '@') {
        e.preventDefault();
        if (editor) {
          // Toggle: if not at 100%, reset to 100%; otherwise zoom to fit all
          const zoom = editor.getZoomLevel();
          if (Math.abs(zoom - 1) > 0.05) {
            editor.resetZoom(undefined, { force: true, animation: { duration: 300 } });
          } else {
            editor.zoomToFit({ force: true, animation: { duration: 300 } });
          }
        }
        return;
      }
      if (e.shiftKey && e.key === ')') { e.preventDefault(); editor?.resetZoom(undefined, { force: true, animation: { duration: 300 } }); return; }
      if (isLocked) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevious(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, goNext, goPrevious]);

  // Warn before refresh if audio files are loaded in memory
  useEffect(() => {
    const hasAudioLoaded = animationSteps.some(s => s.audio?.data);
    if (!hasAudioLoaded) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [animationSteps]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const data = buildSaveData();
    // Strip audio data before saving
    if (data.animationSteps) {
      data.animationSteps = data.animationSteps.map((s: any) => {
        if (s.audio?.data) {
          return { ...s, audio: { ...s.audio, data: '' } };
        }
        return s;
      });
    }
    const key = `lesson-canvas-${siteId}-${topicSlug}-${subtopicSlug}`;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      setIsSaved(true);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
      setIsSaved(false);
    }
  }, [editor, siteId, topicSlug, subtopicSlug, buildSaveData]);

  const handleExport = useCallback(() => {
    if (!editor) return;
    const data = buildSaveData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `lesson-${topicSlug}-${subtopicSlug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editor, topicSlug, subtopicSlug, buildSaveData]);

  const handleExportPng = useCallback(async () => {
    const canvasArea = document.getElementById('canvas-export-area');
    if (!canvasArea) return;
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(canvasArea, {
        backgroundColor: '#f0ede8',
        pixelRatio: 2,
        // Exclude UI overlays like timeline, sidebar, drop zones from the screenshot
        filter: (node: HTMLElement) => {
          if (!(node instanceof HTMLElement)) return true;
          const cl = node.classList;
          // Keep tldraw canvas and RF overlay; skip floating UI widgets
          if (cl?.contains('timeline-bar-widget')) return false;
          if (cl?.contains('sub-topic-sidebar')) return false;
          if (node.getAttribute('data-drag-handle') !== null && node.closest?.('.timeline-bar-widget')) return false;
          return true;
        },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `canvas-${topicSlug}-${subtopicSlug}.png`;
      a.click();
    } catch (err) {
      console.error('PNG export failed:', err);
    }
  }, [topicSlug, subtopicSlug]);

  const handleImport = useCallback(() => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as LessonCanvasData;
          if (data.snapshot && editor) {
            loadSnapshot(editor.store, data.snapshot as Parameters<typeof loadSnapshot>[1]);
          }
          if (data.animationSteps) setAnimationSteps(data.animationSteps);
          if (data.subTopicLabels) setSubTopicLabels(data.subTopicLabels);
          if (data.shapeAnimations) setShapeAnimations(data.shapeAnimations);
          if (data.diagramData) {
            setDiagramData(data.diagramData as DiagramData);
            setRfEdgeType((data.diagramData as DiagramData).edgeType);
            setRfPathType((data.diagramData as DiagramData).pathType);
            setRfArrowType((data.diagramData as DiagramData).arrowType);
            setRfColor((data.diagramData as DiagramData).color);
          }
          setIsSaved(false);
        } catch (err) {
          console.error('Failed to import lesson:', err);
          alert('Invalid lesson file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [editor]);

  const handleSeedCanvas = useCallback((ed: Editor) => {
    if (topicSlug === 'java' && subtopicSlug === 'oop-concepts') {
      const steps = createSampleOOPLesson(ed);
      if (steps.length > 0) {
        setAnimationSteps(steps);
        setTimeout(() => applyAnimationState(ed, steps, 0), 50);
      }
    }
  }, [topicSlug, subtopicSlug, applyAnimationState]);

  return (
    <div className={`w-full ${isPresenting ? 'h-screen' : 'h-[calc(100vh-78px)]'} flex flex-col overflow-hidden`}>
      {/* ─── Main Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0f1b3d] border-b border-[#1a2a5e] flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to={backPath} className="flex items-center gap-1.5 text-blue-100 hover:text-blue-100 text-sm transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Link>
          <div className="w-px h-5 bg-blue-900" />
          <span className="text-blue-200 text-sm">{topicTitle}</span>
          <span className="text-blue-400 text-sm">/</span>
          <span className="text-blue-100 text-sm font-medium">{subtopicTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Step counter (locked) */}
          {isLocked && animationSteps.length > 0 && (
            <div className={`flex items-center gap-1.5 ${!hideLockButton ? 'mr-2' : ''}`}>
              <button onClick={goPrevious} disabled={currentStep < 0} className="p-1 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-3.5 h-3.5 text-blue-100" />
              </button>
              <span className="text-blue-100 text-xs font-medium min-w-[40px] text-center">
                {currentStep + 1} / {animationSteps.length}
              </span>
              <button onClick={goNext} disabled={currentStep >= animationSteps.length - 1} className="p-1 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-3.5 h-3.5 text-blue-100" />
              </button>
            </div>
          )}

          {/* Lock/Unlock */}
          {!hideLockButton && !isPresenting && (
            <button onClick={toggleLock} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${isLocked ? 'bg-blue-900 text-blue-100 hover:bg-blue-800 border border-blue-800' : 'bg-emerald-600 text-white hover:bg-emerald-600/30 border border-emerald-500/30'}`}>
              {isLocked ? <><Lock className="w-3.5 h-3.5" />Locked</> : <><Unlock className="w-3.5 h-3.5" />Unlocked</>}
            </button>
          )}

          {/* Save */}
          {!isLocked && (
            <button onClick={handleSave} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSaved ? 'bg-blue-900 text-blue-300' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
              <Save className="w-3.5 h-3.5" />{isSaved ? 'Saved' : 'Save'}
            </button>
          )}

          {/* Export / Import */}
          {!isLocked && (
            <>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all" title="Export as JSON">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleExportPng} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all" title="Export as PNG">
                <ImageDown className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all" title="Import JSON">
                <Upload className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Panel toggle buttons (unlocked) */}
          {!isLocked && (
            <>
              <button onClick={() => setShowLineConfig(!showLineConfig)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showLineConfig ? 'bg-cyan-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                Lines
              </button>
              <button onClick={() => setShowAnimBar(!showAnimBar)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showAnimBar ? 'bg-purple-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                <Palette className="w-3 h-3" />
                Colors
              </button>
              <button onClick={() => setShowNodes(!showNodes)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showNodes ? 'bg-emerald-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                <Boxes className="w-3 h-3" />
                Nodes
              </button>
              <button
                onClick={() => {
                  if (!editor) return;
                  const { x, y } = editor.getViewportScreenCenter();
                  const point = editor.screenToPage({ x, y });
                  editor.createShape({ type: 'code-block' as any, x: point.x - 250, y: point.y - 150 });
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all"
              >
                <Code2 className="w-3 h-3" />
                Code
              </button>
              <button
                onClick={() => {
                  if (!editor) return;
                  const { x, y } = editor.getViewportScreenCenter();
                  const point = editor.screenToPage({ x, y });
                  editor.createShape({ type: 'md-block' as any, x: point.x - 250, y: point.y - 175 });
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all"
              >
                <FileText className="w-3 h-3" />
                Markdown
              </button>
            </>
          )}
          {/* Public canvas toggle — hidden when presenting */}
          {!isPresenting && (
            <button onClick={() => setShowPublicCanvas(!showPublicCanvas)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${showPublicCanvas ? 'bg-emerald-600 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
              <Eye className="w-3 h-3" />
              Public
            </button>
          )}
        </div>
      </div>

      {/* ─── Storage Warning ──────────────────────────────────────── */}
      {storageWarning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 flex-shrink-0">
          <span className="text-amber-300 text-xs font-medium">⚠️ Canvas too large for auto-save. Export JSON (↓) to keep your work.</span>
          <button onClick={() => setStorageWarning(false)} className="text-amber-400 text-xs hover:text-amber-200 ml-auto">✕</button>
        </div>
      )}

      {/* ─── Public Canvas OR Main Canvas ─────────────────────────── */}
      {showPublicCanvas ? (
        <PublicMarkdownEditor
          topicSlug={topicSlug}
          subtopicSlug={subtopicSlug}
          subtopicTitle={subtopicTitle}
          siteId={siteId}
          initialData={publicCanvasData}
        />
      ) : (
      <>
      {/* ─── Line Config Bar (below toolbar, when unlocked) ───────────── */}
      {!isLocked && showLineConfig && (
        <DiagramToolbar
          edgeType={rfEdgeType}
          pathType={rfPathType}
          arrowType={rfArrowType}
          color={rfColor}
          onEdgeTypeChange={setRfEdgeType}
          onPathTypeChange={setRfPathType}
          onArrowTypeChange={setRfArrowType}
          onColorChange={setRfColor}
          hasEdgeSelection={rfSelectedEdgeIds.length > 0}
          onFlip={handleRfFlip}
        />
      )}

      {/* ─── Canvas + Sidebar ─────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Canvas Area (full width — sidebar overlays) */}
        <div id="canvas-export-area" className="absolute inset-0">
        {/* tldraw canvas — always visible */}
        <div className={`w-full h-full ${isLocked ? 'canvas-locked' : ''} ${!isLocked && !showAnimBar ? 'hide-style-panel' : ''} ${canvasReady ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}>
          <CanvasEditor
            snapshot={snapshot}
            onEditorReady={handleEditorReady}
            onSnapshotChange={handleSnapshotChange}
            onSeedCanvas={handleSeedCanvas}
            hideUi={isLocked}
          />
        </div>

        {/* React Flow diagram overlay — always rendered so nodes/edges stay in DOM for animation steps */}
        <div ref={diagramWrapperRef} className={`absolute inset-0 z-10 pointer-events-none ${isLocked && currentStep < 0 ? 'invisible' : ''} ${isLocked ? 'rf-locked' : ''}`}>
          <DiagramEditor
            diagramData={diagramData}
            onDiagramChange={handleDiagramChange}
            onSelectionChange={handleRfSelectionChange}
            pendingNode={pendingNode}
            onPendingNodeConsumed={() => setPendingNode(null)}
            tldrawCamera={tldrawCamera}
            onReady={handleDiagramReady}
            edgeType={rfEdgeType}
            pathType={rfPathType}
            arrowType={rfArrowType}
            color={rfColor}
            onEdgeTypeChange={setRfEdgeType}
            onPathTypeChange={setRfPathType}
            onArrowTypeChange={setRfArrowType}
            onColorChange={setRfColor}
          />
        </div>

        {/* Drop zone overlay — catches node catalog drops above tldraw */}
        {!isLocked && <DropZone onNodeDrop={setPendingNode} editor={editor} />}

        {/* Destination picker — drag shape then confirm */}
        {pickingDestinationForStep && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-slate-900/95 backdrop-blur-md text-blue-100 text-xs font-medium px-4 py-2.5 rounded-lg border border-blue-800/40 shadow-xl">
            <span className="text-blue-300">Drag the shape to its destination</span>
            <button
              onClick={() => {
                if (!editor) return;
                const step = animationSteps.find(s => s.id === pickingDestinationForStep);
                if (!step || step.shapeIds.length === 0) return;
                const shapeId = step.shapeIds[0];
                const shape = editor.getShape(shapeId as any);
                if (!shape) return;

                // Save current (dragged-to) position as target
                const targetPos = { x: (shape as any).x, y: (shape as any).y };

                // Move shape back to original position
                if (pickOriginalPosition) {
                  editor.updateShape({
                    id: shape.id,
                    type: shape.type,
                    x: pickOriginalPosition.x,
                    y: pickOriginalPosition.y,
                  });
                }

                // Save target position in the step
                setAnimationSteps(steps => steps.map(s =>
                  s.id === pickingDestinationForStep ? { ...s, targetPosition: targetPos } : s
                ));

                // Re-lock canvas
                editor.updateInstanceState({ isReadonly: true });
                setPickingDestinationForStep(null);
                setPickOriginalPosition(null);
                setIsSaved(false);
              }}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-blue-100 text-xs font-semibold transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                if (!editor) return;
                // Cancel — move shape back to original
                const step = animationSteps.find(s => s.id === pickingDestinationForStep);
                if (step && step.shapeIds.length > 0 && pickOriginalPosition) {
                  const shapeId = step.shapeIds[0];
                  const shape = editor.getShape(shapeId as any);
                  if (shape) {
                    editor.updateShape({
                      id: shape.id,
                      type: shape.type,
                      x: pickOriginalPosition.x,
                      y: pickOriginalPosition.y,
                    });
                  }
                }
                editor.updateInstanceState({ isReadonly: true });
                setPickingDestinationForStep(null);
                setPickOriginalPosition(null);
              }}
              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-blue-200 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ─── Floating Widgets (all draggable, dark glass-morphism) ──── */}

        {/* Nodes Catalog */}
        {!isLocked && showNodes && (
          <DraggableWidget defaultPosition={{ x: 16, y: 16 }} zIndex={50}>
            <div className="bg-[#0f1b3d]/95 backdrop-blur-xl rounded-xl border border-emerald-400/25 shadow-2xl shadow-emerald-500/5 overflow-hidden w-72">
              <div data-drag-handle className="flex items-center justify-between px-3 py-2.5 border-b border-emerald-400/15 bg-emerald-500/8 cursor-grab active:cursor-grabbing">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Boxes className="w-3 h-3" />
                  Node Catalog
                </span>
              </div>
              <NodeCatalog />
            </div>
          </DraggableWidget>
        )}

        {/* Laser pointer overlay — only in presentation mode with laser tool */}
        {isPresenting && isLocked && presentationTool === 'laser' && <LaserPointer />}
      </div>

      {/* Timeline — draggable overlay, default at bottom */}
      {!isLocked && (
        <DraggableWidget defaultPosition={{ x: 0, y: window.innerHeight - 250 }} zIndex={35}>
          <div className="rounded-xl overflow-hidden shadow-2xl border border-[#1a2a5e]" style={{ width: 'calc(85vw - 20px)' }}>
            <TimelineBar
              steps={animationSteps}
              onStepsChange={handleStepsChange}
              editor={editor}
              isLocked={isLocked}
              diagramData={diagramData}
              selectedShapeIds={selectedShapeIds}
            />
          </div>
        </DraggableWidget>
      )}

      {/* Sub Topic Sidebar (overlays right side) */}
      <div className="absolute top-0 right-0 bottom-0 w-[15%] min-w-[180px] border-l border-[#1a2a5e] bg-[#0a1230] flex flex-col overflow-hidden z-30">
        <SubTopicTracker
          labels={subTopicLabels}
          onLabelsChange={handleLabelsChange}
          steps={animationSteps}
          isLocked={isLocked}
          currentStep={currentStep}
          sidebar
          sidebarTitle={sidebarTitle}
          onSidebarTitleChange={setSidebarTitle}
        />
      </div>
      </div>

      </>
      )}
    </div>
  );
}
