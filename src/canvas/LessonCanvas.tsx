import { useState, useCallback, useEffect, useRef } from 'react';
import { getSnapshot, loadSnapshot, toRichText, createShapeId } from 'tldraw';
import type { Editor } from 'tldraw';
import { Lock, Unlock, Save, ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, Download, Upload, Palette, Boxes, Code2, FileText, Eye, ImageDown, RotateCcw, Trash2, AlignJustify, PanelRight, FlipHorizontal2, Frame } from 'lucide-react';
import { Link } from 'react-router-dom';
import CanvasEditor from './CanvasEditor';
import { createSampleOOPLesson } from './sampleLesson';
import type { AnimationStep, AnimationType, StepAction, SubTopicLabel, LessonCanvasData, ShapeAnimationConfig } from './types';
import SubTopicTracker from './SubTopicTracker';
import PagePanel from './PagePanel';
import { applyIdleAnimation } from './animationEngine';
import { applyStepAnimation, clearStepAnimations, applyBlinkAnimation, applyMoveAnimation, applyTeleportAnimation, rewindMoveRecords, applyZoomToShapes, rewindZoom } from './stepAnimations';
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
  const editorRef = useRef<Editor | null>(null);
  const [snapshot, setSnapshot] = useState<unknown>(initialData?.snapshot || null);
  const [animationSteps, setAnimationSteps] = useState<AnimationStep[]>(initialData?.animationSteps || []);
  const [subTopicLabels, setSubTopicLabels] = useState<SubTopicLabel[]>(initialData?.subTopicLabels || []);
  const [sidebarTitle, setSidebarTitle] = useState(initialData?.sidebarTitle || 'Topics');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [timelineFullyCollapsed, setTimelineFullyCollapsed] = useState(false); // true = show Pages, false = show Sub-topics
  const [shapeAnimations, setShapeAnimations] = useState<Record<string, ShapeAnimationConfig>>(initialData?.shapeAnimations || {});
  const [currentStep, setCurrentStep] = useState(-1);
  // Track which virtual topic/subtitle steps have been revealed per page
  const [revealedTopicPages, setRevealedTopicPages] = useState<Set<string>>(new Set());
  const [revealedSubtitlePages, setRevealedSubtitlePages] = useState<Set<string>>(new Set());
  const [showAnimBar, setShowAnimBar] = useState(false);
  const [showLineConfig, setShowLineConfig] = useState(false);
  const [showNodes, setShowNodes] = useState(false);
  const [showTextBoundary, setShowTextBoundary] = useState(false);
  const showTextBoundaryRef = useRef(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showGuideBorder, setShowGuideBorder] = useState(true);
  const [bwMode, setBwMode] = useState(initialData?.bwMode || false);
  // Per-page topic/subtitle data (keyed by pageId)
  const [pageTopics, setPageTopics] = useState<Record<string, string>>(initialData?.pageTopics || {});
  const [pageSubtitles, setPageSubtitles] = useState<Record<string, string>>(initialData?.pageSubtitles || {});
  const [pageTopicColors, setPageTopicColors] = useState<Record<string, string>>(initialData?.pageTopicColors || {});
  const [pageSubtitleColors, setPageSubtitleColors] = useState<Record<string, string>>(initialData?.pageSubtitleColors || {});
  const [pageTopicBorderColors, setPageTopicBorderColors] = useState<Record<string, string>>(initialData?.pageTopicBorderColors || {});
  const [pageSubtitleBorderColors, setPageSubtitleBorderColors] = useState<Record<string, string>>(initialData?.pageSubtitleBorderColors || {});
  const [pageTopicAnimations, setPageTopicAnimations] = useState<Record<string, string>>(initialData?.pageTopicAnimations || {});
  const [pageSubtitleAnimations, setPageSubtitleAnimations] = useState<Record<string, string>>(initialData?.pageSubtitleAnimations || {});
  // 'preload' = visible immediately, 'animate' = needs right-arrow to appear
  const [pageTopicModes, setPageTopicModes] = useState<Record<string, 'preload' | 'animate'>>(initialData?.pageTopicModes || {});
  const [pageSubtitleModes, setPageSubtitleModes] = useState<Record<string, 'preload' | 'animate'>>(initialData?.pageSubtitleModes || {});
  const [topicColorPickerOpen, setTopicColorPickerOpen] = useState(false);
  const [subtitleColorPickerOpen, setSubtitleColorPickerOpen] = useState(false);
  // Track which pages have topic/subtitle visible (toggled by toolbar buttons)
  const [pageTopicVisible, setPageTopicVisible] = useState<Set<string>>(() => new Set(Object.keys(initialData?.pageTopics || {})));
  const [pageSubtitleVisible, setPageSubtitleVisible] = useState<Set<string>>(() => new Set(Object.keys(initialData?.pageSubtitles || {})));
  const [guideResizeTick, setGuideResizeTick] = useState(0);
  // Guide border position offset in page coordinates (draggable)
  const [guideOffset, setGuideOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const guideDragRef = useRef<{ startX: number; startY: number; origOffX: number; origOffY: number } | null>(null);
  useEffect(() => {
    const onResize = () => setGuideResizeTick(t => t + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [pendingNode, setPendingNode] = useState<{ item: any; position: { x: number; y: number } } | null>(null);
  const [pickingDestinationForStep, setPickingDestinationForStep] = useState<string | null>(null);
  const [pickOriginalPosition, setPickOriginalPosition] = useState<{ x: number; y: number } | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const isDirtyRef = useRef(false);
  // Helper: mark canvas as dirty (unsaved changes) — used by all change handlers
  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setIsSaved(false);
  }, []);
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
  // Track pending camera-first step: first arrow moves camera, second arrow plays animation
  const pendingCameraStepRef = useRef<{ nextStep: number; step: any } | null>(null);
  const zoomSavedCamerasRef = useRef<Record<string, { x: number; y: number; z: number }>>({});
  const presentationStartCameraRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const editingCameraRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const editingPageIdRef = useRef<string | null>(null);
  const stepAudioRef = useRef<HTMLAudioElement | null>(null);
  const stepAudioTimerRef = useRef<number | null>(null);

  const handleRfSelectionChange = useCallback((nodeIds: string[], edgeIds: string[]) => {
    setRfSelectedNodeIds(nodeIds);
    setRfSelectedEdgeIds(edgeIds);
  }, []);

  const handleDiagramChange = useCallback((data: DiagramData) => {
    setDiagramData(data);
    markDirty();
  }, []);

  const handleRfFlip = useCallback(() => {
    const wrapper = diagramWrapperRef.current?.querySelector('.rf-diagram-wrapper') as HTMLElement & { __flipEdges?: () => void } | null;
    if (wrapper?.__flipEdges) wrapper.__flipEdges();
  }, []);

  // ─── Load public canvas data from localStorage ────────────────────────────
  // ─── Load public canvas data from disk ────────────────────────────────────
  useEffect(() => {
    fetch(`/__load-public-canvas?siteId=${encodeURIComponent(siteId)}&topicSlug=${encodeURIComponent(topicSlug)}&subtopicSlug=${encodeURIComponent(subtopicSlug)}`)
      .then(res => res.json())
      .then((data) => {
        if (data && data.version) setPublicCanvasData(data);
      })
      .catch(() => { /* no public canvas data */ });
  }, [siteId, topicSlug, subtopicSlug]);

  // ─── tldraw callbacks ────────────────────────────────────────────────────
  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
    editorRef.current = ed;
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

    // Collect shape IDs from "none" animation steps — these are preloaded, never hidden
    const preloadedIds = new Set(
      steps.filter(s => s.animation === 'none' && (s.action || 'enter') === 'enter')
        .flatMap(s => s.shapeIds)
    );

    // Hide all tldraw animated shapes via CSS (except preloaded ones)
    const allAnimatedIds = new Set(visibilitySteps.flatMap(s => s.shapeIds).filter(isTldrawId));
    allAnimatedIds.forEach(shapeId => {
      if (preloadedIds.has(shapeId)) return; // preloaded — stay visible
      const el = document.querySelector(`[data-shape-id="${shapeId}"]`) as HTMLElement | null;
      if (el) {
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
      }
    });

    // Hide all RF animated elements via class (except preloaded ones)
    const allRfIds = new Set(visibilitySteps.flatMap(s => s.shapeIds).filter(isRfId));
    allRfIds.forEach(rfId => {
      if (preloadedIds.has(rfId)) return; // preloaded — stay visible
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
    markDirty();
  }, []);

  const handleStepsChange = useCallback((newSteps: AnimationStep[]) => {
    setAnimationSteps(newSteps);
    markDirty();
  }, []);

  // Delete RF nodes/edges from diagram data when removed from timeline
  const handleDeleteRfElements = useCallback((ids: string[]) => {
    setDiagramData(prev => ({
      ...prev,
      nodes: (prev.nodes as any[]).filter((n: any) => !ids.includes(n.id)),
      edges: (prev.edges as any[]).filter((e: any) => !ids.includes(e.id)),
    }));
    markDirty();
  }, []);

  // Watch for deleted shapes and clean up animation steps + sub-topic ranges
  useEffect(() => {
    if (!editor || isLocked) return;

    const cleanup = () => {
      const currentPageId = editor.getCurrentPageId() as string;
      const existingShapeIds = new Set(
        editor.getCurrentPageShapeIds() as Set<string>
      );

      const rfNodeIds = new Set(diagramData.nodes.map((n: any) => n.id as string));
      const rfEdgeIds = new Set(diagramData.edges.map((e: any) => e.id as string));

      const currentSteps = animationStepsRef.current;
      const cleanedSteps = currentSteps
        .map(step => {
          // Only clean steps belonging to the current page
          if ((step.pageId || '') !== currentPageId) return step;
          return {
            ...step,
            shapeIds: step.shapeIds.filter(id => {
              if (pasteFrameIdsRef.current.has(id)) return true; // don't clean frame shapes
              if (isRfId(id)) return rfNodeIds.has(id) || rfEdgeIds.has(id);
              return existingShapeIds.has(id);
            }),
          };
        })
        .filter(step => step.shapeIds.length > 0);

      if (cleanedSteps.length !== currentSteps.length) {
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
        markDirty();
      }
    };

    const unsub = editor.store.listen(cleanup, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked, subTopicLabels, shapeAnimations, diagramData]);

  // ─── Auto-add new shapes to timeline ─────────────────────────────────────
  const knownShapeIdsRef = useRef<Set<string>>(new Set());
  const multiLinePasteRef = useRef(false);
  // Track groups of text shapes pasted together for auto-reflow
  const pasteGroupsRef = useRef<Map<string, string[]>>(new Map()); // groupId → [shapeId, ...]
  const shapeHeightsRef = useRef<Map<string, number>>(new Map()); // shapeId → last known height
  const pasteFrameRef = useRef<Map<string, { frameId: string; baseX: number; textWidth: number }>>(new Map()); // groupId → frame info
  const pasteFrameIdsRef = useRef<Set<string>>(new Set()); // all frame shape IDs to exclude from timeline
  const animationStepsRef = useRef(animationSteps);
  animationStepsRef.current = animationSteps;

  useEffect(() => {
    if (!editor || isLocked) return;

    // Initialize known shapes for the current page
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

      // Use ref for fresh steps (avoids stale closure)
      const currentSteps = animationStepsRef.current;
      const existingStepShapeIds = new Set(currentSteps.flatMap(s => s.shapeIds));
      const trulyNew = newIds.filter(id => {
        if (existingStepShapeIds.has(id)) return false;
        if (pasteFrameIdsRef.current.has(id)) return false;
        // Exclude boundary frames by meta
        const shape = editor.getShape(id as any) as any;
        if (shape?.meta?.isPasteBoundary) return false;
        return true;
      });
      if (trulyNew.length === 0) return;

      const pageId = editor.getCurrentPageId() as string;

      // Skip if this page was recently duplicated
      if (recentlyDuplicatedPagesRef.current.has(pageId)) return;

      // Skip if this page is new (not in knownPageIds) — it's a page duplication
      if (!knownPageIdsRef.current.has(pageId)) {
        recentlyDuplicatedPagesRef.current.add(pageId);
        return;
      }

      // If many shapes appeared at once, likely a duplication that slipped through
      // But not if they were from a multi-line paste or image drop (tracked via ref)
      // Allow up to 20 shapes at once (images can add many)
      if (trulyNew.length > 20 && !multiLinePasteRef.current) return;
      multiLinePasteRef.current = false;

      const newSteps: AnimationStep[] = trulyNew.map((id, i) => ({
        id: `step-${Date.now()}-${i}`,
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
          const pages = editor.getPages();
          const pageOrder = pages.map(p => p.id as string);
          const currentPageIdx = pageOrder.indexOf(pageId);
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
      markDirty();
    };

    // Also re-initialize known shapes when the current page changes
    const handlePageSwitch = () => {
      const shapes = editor.getCurrentPageShapes();
      knownShapeIdsRef.current = new Set(shapes.map(s => s.id as string));
    };

    const unsub = editor.store.listen(() => {
      detectNewShapes();
    }, { scope: 'document' });

    // Also listen for page switches
    const unsubSession = editor.store.listen(handlePageSwitch, { scope: 'session' });

    return () => { unsub(); unsubSession(); };
  }, [editor, isLocked]);

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

    // Check if already in a step (use ref for fresh data)
    const currentSteps = animationStepsRef.current;
    const existingStepShapeIds = new Set(currentSteps.flatMap(s => s.shapeIds));
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
    markDirty();
  }, [diagramData, isLocked, editor]);

  // ─── Page copy/delete listeners ───────────────────────────────────────────
  const knownPageIdsRef = useRef<Set<string>>(new Set());
  // Track recently duplicated page IDs so auto-add skips them
  const recentlyDuplicatedPagesRef = useRef<Set<string>>(new Set());
  const pageCheckIntervalRef = useRef<number | null>(null);

  // Backfill pageId on existing steps that don't have one (runs once on mount)
  useEffect(() => {
    if (!editor) return;
    const pages = editor.getPages();
    const firstPageId = pages[0]?.id as string;
    if (!firstPageId) return;
    setAnimationSteps(prev => {
      const needsFix = prev.some(s => !s.pageId);
      if (!needsFix) return prev;
      return prev.map(s => s.pageId ? s : { ...s, pageId: firstPageId });
    });
    knownPageIdsRef.current = new Set(pages.map(p => p.id as string));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Poll for page changes (every 500ms) — simpler and more reliable than store listener
  useEffect(() => {
    if (!editor) return;

    pageCheckIntervalRef.current = window.setInterval(() => {
      const currentPages = editor.getPages();
      const currentPageIds = new Set(currentPages.map(p => p.id as string));

      // Skip if nothing changed
      if (currentPageIds.size === knownPageIdsRef.current.size) {
        let same = true;
        for (const id of currentPageIds) {
          if (!knownPageIdsRef.current.has(id)) { same = false; break; }
        }
        if (same) return;
      }

      // Detect new pages
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

      // Handle page deletion
      if (deletedPageIds.length > 0) {
        setAnimationSteps(prev => prev.filter(s => !deletedPageIds.includes(s.pageId || '')));
        markDirty();
      }

      // Handle page duplication
      if (newPageIds.length > 0) {
        for (const newPageId of newPageIds) {
          const newPageShapeIds = new Set(
            [...editor.getPageShapeIds(newPageId as any)].map(id => id as string)
          );
          if (newPageShapeIds.size === 0) continue;

          // Delete any boundary frames that got copied from the source page
          const boundaryShapesToDelete: string[] = [];
          for (const shapeId of newPageShapeIds) {
            const shape = editor.getShape(shapeId as any) as any;
            if (shape?.meta?.isPasteBoundary) {
              boundaryShapesToDelete.push(shapeId);
            }
          }
          if (boundaryShapesToDelete.length > 0) {
            editor.deleteShapes(boundaryShapesToDelete as any);
          }

          // Mark as recently duplicated so auto-add skips it
          recentlyDuplicatedPagesRef.current.add(newPageId);
          setTimeout(() => recentlyDuplicatedPagesRef.current.delete(newPageId), 3000);

          const allPages = editor.getPages();
          const newPageIndex = allPages.findIndex(p => (p.id as string) === newPageId);
          let sourcePageId: string | null = null;
          if (newPageIndex > 0) {
            sourcePageId = allPages[newPageIndex - 1].id as string;
          }

          if (sourcePageId) {
            setAnimationSteps(prev => {
              const sourceSteps = prev.filter(s => s.pageId === sourcePageId);
              if (sourceSteps.length === 0) return prev;

              // Map source shape IDs → new shape IDs by type+position matching
              const sourceShapes = [...editor.getPageShapeIds(sourcePageId as any)]
                .map(id => editor.getShape(id))
                .filter((s: any) => s && !s.meta?.isPasteBoundary) as any[];
              const newShapes = [...editor.getPageShapeIds(newPageId as any)]
                .map(id => editor.getShape(id))
                .filter((s: any) => s && !s.meta?.isPasteBoundary) as any[];

              const idMapping = new Map<string, string>();
              const usedNewIds = new Set<string>();
              for (const srcShape of sourceShapes) {
                const match = newShapes.find((ns: any) =>
                  ns.type === srcShape.type &&
                  Math.abs(ns.x - srcShape.x) < 1 &&
                  Math.abs(ns.y - srcShape.y) < 1 &&
                  !usedNewIds.has(ns.id as string)
                );
                if (match) {
                  idMapping.set(srcShape.id as string, match.id as string);
                  usedNewIds.add(match.id as string);
                }
              }

              // Only create steps for shapes that were in timeline steps (not all shapes on page)
              const duplicatedSteps: AnimationStep[] = sourceSteps.map((step, i) => ({
                ...step,
                id: `step-${Date.now()}-dup-${i}`,
                pageId: newPageId,
                shapeIds: step.shapeIds.map(sid => idMapping.get(sid) || sid),
                // Keep cameraPosition and animation — same layout on new page
                // Only clear audio data (memory-only, needs re-upload)
                audio: step.audio ? { ...step.audio, data: '' } : undefined,
              }));

              const lastSourceIndex = prev.map(s => s.pageId).lastIndexOf(sourcePageId!);
              const result = [...prev];
              result.splice(lastSourceIndex + 1, 0, ...duplicatedSteps);
              return result;
            });
            markDirty();
          }
        }
      }
    }, 500);

    return () => {
      if (pageCheckIntervalRef.current) {
        clearInterval(pageCheckIntervalRef.current);
      }
    };
  }, [editor]);

  const handleLabelsChange = useCallback((newLabels: SubTopicLabel[]) => {
    setSubTopicLabels(newLabels);
    markDirty();
  }, []);

  // ─── Auto-sync SubTopicLabels from pageSubtitles ────────────────────────
  useEffect(() => {
    if (!editor) return;
    const pages = editor.getPages();
    const newLabels: SubTopicLabel[] = [];
    pages.forEach((page, idx) => {
      const pid = page.id as string;
      if (pageSubtitleVisible.has(pid) && pageSubtitles[pid]) {
        newLabels.push({
          id: `auto-${pid}`,
          title: pageSubtitles[pid],
          startStep: 0,
          endStep: 0,
          startPage: idx,
          endPage: idx,
        });
      }
    });
    // Only update if labels actually changed (avoid infinite loop)
    const currentIds = subTopicLabels.map(l => l.id + ':' + l.title).join(',');
    const newIds = newLabels.map(l => l.id + ':' + l.title).join(',');
    if (currentIds !== newIds) {
      setSubTopicLabels(newLabels);
      markDirty();
    }
  }, [editor, pageSubtitles, pageSubtitleVisible]);

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
      sidebarTitle,
      shapeAnimations,
      diagramData,
      pageTopics,
      pageSubtitles,
      pageTopicColors,
      pageSubtitleColors,
      pageTopicBorderColors,
      pageSubtitleBorderColors,
      pageTopicAnimations,
      pageSubtitleAnimations,
      pageTopicModes,
      pageSubtitleModes,
      bwMode,
    };
  }, [editor, snapshot, topicSlug, subtopicSlug, subtopicTitle, animationSteps, subTopicLabels, sidebarTitle, shapeAnimations, diagramData, initialData, pageTopics, pageSubtitles, pageTopicColors, pageSubtitleColors, pageTopicBorderColors, pageSubtitleBorderColors, pageTopicAnimations, pageSubtitleAnimations, pageTopicModes, pageSubtitleModes, bwMode]);


  // Auto-save to disk via Vite plugin — interval-based for reliability
  const autoSaveTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaveHealthy, setAutoSaveHealthy] = useState(true);
  const subTopicLabelsRef = useRef(subTopicLabels);
  subTopicLabelsRef.current = subTopicLabels;
  const shapeAnimationsRef = useRef(shapeAnimations);
  shapeAnimationsRef.current = shapeAnimations;
  const diagramDataRef = useRef(diagramData);
  diagramDataRef.current = diagramData;
  const canvasTopicRef = useRef(pageTopics);
  canvasTopicRef.current = pageTopics;
  const canvasSubtitlesRef = useRef(pageSubtitles);
  canvasSubtitlesRef.current = pageSubtitles;
  const pageTopicColorsRef = useRef(pageTopicColors);
  pageTopicColorsRef.current = pageTopicColors;
  const pageSubtitleColorsRef = useRef(pageSubtitleColors);
  pageSubtitleColorsRef.current = pageSubtitleColors;
  const pageTopicBorderColorsRef = useRef(pageTopicBorderColors);
  pageTopicBorderColorsRef.current = pageTopicBorderColors;
  const pageSubtitleBorderColorsRef = useRef(pageSubtitleBorderColors);
  pageSubtitleBorderColorsRef.current = pageSubtitleBorderColors;
  const pageTopicAnimationsRef = useRef(pageTopicAnimations);
  pageTopicAnimationsRef.current = pageTopicAnimations;
  const pageSubtitleAnimationsRef = useRef(pageSubtitleAnimations);
  pageSubtitleAnimationsRef.current = pageSubtitleAnimations;
  const pageTopicModesRef = useRef(pageTopicModes);
  pageTopicModesRef.current = pageTopicModes;
  const pageSubtitleModesRef = useRef(pageSubtitleModes);
  pageSubtitleModesRef.current = pageSubtitleModes;
  const pageTopicVisibleRef = useRef(pageTopicVisible);
  pageTopicVisibleRef.current = pageTopicVisible;
  const pageSubtitleVisibleRef = useRef(pageSubtitleVisible);
  pageSubtitleVisibleRef.current = pageSubtitleVisible;

  useEffect(() => {
    // Run auto-save every 3 seconds via interval
    const interval = window.setInterval(async () => {
      const ed = editorRef.current;
      if (!ed || isSavingRef.current || !isDirtyRef.current) return;
      isSavingRef.current = true;
      isDirtyRef.current = false;

      const doc = getSnapshot(ed.store).document;
      const cam = ed.getCamera();
      const data: LessonCanvasData = {
        version: 2,
        meta: {
          topicSlug, subtopicSlug, title: subtopicTitle,
          createdAt: initialData?.meta.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        snapshot: { document: doc },
        camera: cam ? { x: cam.x, y: cam.y, z: cam.z } : undefined,
        animationSteps: animationStepsRef.current,
        subTopicLabels: subTopicLabelsRef.current,
        sidebarTitle,
        shapeAnimations: shapeAnimationsRef.current,
        diagramData: diagramDataRef.current,
        pageTopics: canvasTopicRef.current,
        pageSubtitles: canvasSubtitlesRef.current,
        pageTopicColors: pageTopicColorsRef.current,
        pageSubtitleColors: pageSubtitleColorsRef.current,
        pageTopicBorderColors: pageTopicBorderColorsRef.current,
        pageSubtitleBorderColors: pageSubtitleBorderColorsRef.current,
        pageTopicAnimations: pageTopicAnimationsRef.current,
        pageSubtitleAnimations: pageSubtitleAnimationsRef.current,
        pageTopicModes: pageTopicModesRef.current,
        pageSubtitleModes: pageSubtitleModesRef.current,
        bwMode,
      };

      // Strip audio base64 data
      if (data.animationSteps) {
        data.animationSteps = data.animationSteps.map((s: any) => {
          if (s.audio?.data) return { ...s, audio: { ...s.audio, data: '' } };
          return s;
        });
      }

      // Safety check: don't overwrite a rich canvas with an empty/reset state
      // Count pages in the snapshot being saved
      const storeEntries = Object.values((doc as any) || {});
      const pageCount = storeEntries.filter((r: any) => r?.typeName === 'page').length;
      const shapeCount = storeEntries.filter((r: any) => r?.typeName === 'shape').length;
      const stepCount = data.animationSteps?.length || 0;

      // If we have almost nothing, check what's on disk first
      if (pageCount <= 1 && shapeCount <= 2 && stepCount <= 1) {
        try {
          const diskRes = await fetch(`/__load-canvas?siteId=${encodeURIComponent(siteId)}&topicSlug=${encodeURIComponent(topicSlug)}&subtopicSlug=${encodeURIComponent(subtopicSlug)}`);
          const diskData = await diskRes.json();
          if (diskData && diskData.animationSteps && diskData.animationSteps.length > stepCount + 5) {
            // Disk has significantly more data — this is likely HMR/idle reset, skip save
            console.warn('[auto-save] BLOCKED — would overwrite', diskData.animationSteps.length, 'steps with', stepCount);
            isSavingRef.current = false;
            return;
          }
        } catch { /* disk check failed, proceed with save */ }
      }

      fetch('/__save-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, topicSlug, subtopicSlug, data }),
      }).then(() => {
        setLastSavedAt(new Date());
        setAutoSaveHealthy(true);
      }).catch(() => {
        setAutoSaveHealthy(false);
        markDirty();
      }).finally(() => {
        isSavingRef.current = false;
      });
    }, 3000);

    autoSaveTimerRef.current = interval as any;
    return () => clearInterval(interval);
  }, [siteId, topicSlug, subtopicSlug, subtopicTitle, initialData]);

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

  // ─── Page countdown sounds (Web Audio API) + glow state ─────────────────
  const countdownAudioCtxRef = useRef<AudioContext | null>(null);
  const [pageGlow, setPageGlow] = useState<{ pageId: string; type: 'orange' | 'green' } | null>(null);

  const playBeep = useCallback((frequency: number, duration: number, volume = 0.15) => {
    try {
      if (!countdownAudioCtxRef.current) countdownAudioCtxRef.current = new AudioContext();
      const ctx = countdownAudioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration / 1000);
    } catch { /* ignore audio errors */ }
  }, []);

  const playCountdownBeep = useCallback(() => {
    playBeep(520, 150, 0.02);
  }, [playBeep]);

  const playCompletionChime = useCallback(() => {
    playBeep(523, 150, 0.05);
    setTimeout(() => playBeep(659, 150, 0.05), 120);
    setTimeout(() => playBeep(784, 250, 0.06), 240);
  }, [playBeep]);

  // Helper: get the last step index on a given page
  const getLastStepIndexOnPage = useCallback((pageId: string): number => {
    let last = -1;
    for (let i = 0; i < animationSteps.length; i++) {
      if ((animationSteps[i].pageId || 'page:page') === pageId) last = i;
    }
    return last;
  }, [animationSteps]);

  // Helper: check position relative to page end and play sounds
  const playPageCountdownSound = useCallback((stepIndex: number) => {
    if (!editor) return;
    const pid = editor.getCurrentPageId() as string;
    const lastOnPage = getLastStepIndexOnPage(pid);
    if (lastOnPage < 0) return;
    if (stepIndex === lastOnPage) {
      setPageGlow({ pageId: pid, type: 'green' });
      setTimeout(() => setPageGlow(null), 1500);
    } else if (stepIndex === lastOnPage - 1) {
      playCountdownBeep();
      setPageGlow({ pageId: pid, type: 'orange' });
      setTimeout(() => setPageGlow(null), 1500);
    }
  }, [editor, getLastStepIndexOnPage, playCountdownBeep, playCompletionChime]);

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
      if (editingPageIdRef.current && (editor.getCurrentPageId() as string) !== editingPageIdRef.current) {
        editor.setCurrentPage(editingPageIdRef.current as any);
      }
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
      editingPageIdRef.current = editor.getCurrentPageId() as string;
      presentationStartCameraRef.current = { x: cam.x, y: cam.y, z: cam.z };

      // Sort animation steps by tldraw's page order (tab order)
      // Steps within each page keep their relative order
      const pageOrder = editor.getPages().map(p => p.id as string);
      const pageIndexMap = new Map(pageOrder.map((pid, idx) => [pid, idx]));
      const sortedSteps = [...animationSteps].sort((a, b) => {
        const aPage = pageIndexMap.get(a.pageId || 'page:page') ?? 0;
        const bPage = pageIndexMap.get(b.pageId || 'page:page') ?? 0;
        if (aPage !== bPage) return aPage - bPage;
        // Same page — preserve original order
        return animationSteps.indexOf(a) - animationSteps.indexOf(b);
      });
      // Update steps if order changed
      if (sortedSteps.some((s, i) => s.id !== animationSteps[i].id)) {
        setAnimationSteps(sortedSteps);
        animationStepsRef.current = sortedSteps;
      }

      // Switch to the first step's page so presentation starts from the beginning
      const stepsToUse = sortedSteps;
      if (stepsToUse.length > 0 && stepsToUse[0].pageId) {
        const firstStepPageId = stepsToUse[0].pageId;
        if ((editor.getCurrentPageId() as string) !== firstStepPageId) {
          editor.setCurrentPage(firstStepPageId as any);
        }
        // Set camera to first preloaded step's position immediately
        const firstPreloaded = stepsToUse.find(s => s.pageId === firstStepPageId && s.animation === 'none' && s.cameraPosition);
        if (firstPreloaded?.cameraPosition) {
          editor.setCamera(firstPreloaded.cameraPosition, { force: true });
        }
      }

      setCurrentStep(-1);
      setRevealedTopicPages(new Set());
      setRevealedSubtitlePages(new Set());
      pendingCameraStepRef.current = null;
      applyAnimationState(editor, sortedSteps, -1);
      // Re-apply after a frame to catch RF elements that might not be in DOM yet
      setTimeout(() => applyAnimationState(editor, sortedSteps, -1), 100);
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
    const pid = editor.getCurrentPageId() as string;
    const tMode = pageTopicModesRef.current[pid];
    const sMode = pageSubtitleModesRef.current[pid];
    const hasTopic = pageTopicVisibleRef.current.has(pid);
    const hasSubtitle = pageSubtitleVisibleRef.current.has(pid);
    const topicNeedsStep = hasTopic && tMode === 'animate';
    const subtitleNeedsStep = hasSubtitle && sMode === 'animate';

    // Handle virtual topic step
    if (topicNeedsStep && !revealedTopicPages.has(pid)) {
      setRevealedTopicPages(prev => new Set(prev).add(pid));
      return; // consume this arrow press for the topic reveal
    }
    // Handle virtual subtitle step
    if (subtitleNeedsStep && !revealedSubtitlePages.has(pid)) {
      setRevealedSubtitlePages(prev => new Set(prev).add(pid));
      return; // consume this arrow press for the subtitle reveal
    }

    // Handle pending camera step — second press plays the animation
    if (pendingCameraStepRef.current) {
      const pending = pendingCameraStepRef.current;
      pendingCameraStepRef.current = null;
      const pendingStep = pending.step;
      const pendingAction = pendingStep.action || 'enter';

      // Run the step action now
      switch (pendingAction) {
        case 'none': break;
        case 'enter': {
          applyAnimationState(editor!, animationSteps, pending.nextStep);
          if (pendingStep.animation !== 'none') {
            applyStepAnimation(pendingStep.shapeIds, pendingStep.animation, pendingStep.duration);
          }
          pendingStep.shapeIds.forEach((shapeId: string) => {
            const config = shapeAnimations[shapeId];
            if (config?.idle && config.idle !== 'none') {
              applyIdleAnimation(shapeId, config.idle);
            }
          });
          break;
        }
        case 'exit': {
          applyAnimationState(editor!, animationSteps, pending.nextStep);
          break;
        }
        case 'blink': {
          applyBlinkAnimation(pendingStep.shapeIds, pendingStep.duration);
          break;
        }
        default: {
          applyAnimationState(editor!, animationSteps, pending.nextStep);
          applyStepAnimation(pendingStep.shapeIds, pendingStep.animation, pendingStep.duration);
          break;
        }
      }
      playStepAudio(pendingStep);
      playPageCountdownSound(pending.nextStep);
      return;
    }

    // Normal step processing
    if (currentStep >= animationSteps.length - 1) return;
    editor.stopCameraAnimation();
    let nextStep = currentStep + 1;

    // Auto-skip consecutive "none" animation steps (preloaded — already visible)
    while (nextStep < animationSteps.length &&
           animationSteps[nextStep].animation === 'none' &&
           (animationSteps[nextStep].action || 'enter') === 'enter') {
      nextStep++;
    }
    // If we skipped past the end, stay at the last step
    if (nextStep >= animationSteps.length) {
      setCurrentStep(animationSteps.length - 1);
      return;
    }

    const step = animationSteps[nextStep];
    const action = step.action || 'enter';

    // Switch page if the next step belongs to a different page
    if (step.pageId && (editor.getCurrentPageId() as string) !== step.pageId) {
      // Check if the target page has virtual animate steps that need to play first
      const targetPid = step.pageId;
      const targetHasTopic = pageTopicVisibleRef.current.has(targetPid);
      const targetHasSubtitle = pageSubtitleVisibleRef.current.has(targetPid);
      const targetTopicNeedsStep = targetHasTopic && pageTopicModesRef.current[targetPid] === 'animate';
      const targetSubtitleNeedsStep = targetHasSubtitle && pageSubtitleModesRef.current[targetPid] === 'animate';

      // Pre-hide all shapes that will be on the new page by preparing CSS
      // Get all steps for the target page and hide their shapes BEFORE switching
      const targetPageSteps = animationSteps.filter(s => s.pageId === step.pageId);
      const allTargetShapeIds = targetPageSteps.flatMap(s => s.shapeIds);
      
      // Preloaded shapes (animation === 'none') should NOT be hidden during page switch
      const preloadedOnTarget = new Set(
        targetPageSteps
          .filter(s => s.animation === 'none' && (s.action || 'enter') === 'enter')
          .flatMap(s => s.shapeIds)
      );
      
      // Create a style element that hides non-preloaded target page shapes
      const hideStyle = document.createElement('style');
      hideStyle.id = 'page-switch-hide';
      hideStyle.textContent = allTargetShapeIds
        .filter(id => !preloadedOnTarget.has(id))
        .map(id => id.includes(':') 
          ? `[data-shape-id="${id}"] { visibility: hidden !important; opacity: 0 !important; }`
          : `[data-id="${id}"] { visibility: hidden !important; opacity: 0 !important; }`)
        .join('\n');
      document.head.appendChild(hideStyle);

      editor.setCameraOptions({ isLocked: false });
      editor.setCurrentPage(step.pageId as any);

      // Set camera immediately after page switch — BEFORE any paint
      // This prevents the flash of tldraw's internal per-page camera
      if (step.cameraPosition) {
        editor.setCamera(step.cameraPosition, { force: true });
      }

      // Now apply proper animation state and remove the blanket hide
      requestAnimationFrame(() => {
        applyAnimationState(editor, animationSteps, nextStep - 1);
        // Remove blanket hide — applyAnimationState has set correct per-shape visibility
        hideStyle.remove();
        
        if (targetTopicNeedsStep || targetSubtitleNeedsStep) {
          // Target page has virtual steps — auto-reveal the first one during page switch
          editor.setCameraOptions({ isLocked: true });
          if (step.cameraPosition) {
            editor.setCamera(step.cameraPosition, { force: true });
          }
          // Auto-reveal topic if it needs animate, otherwise auto-reveal subtitle
          if (targetTopicNeedsStep) {
            setRevealedTopicPages(prev => new Set(prev).add(targetPid));
          } else if (targetSubtitleNeedsStep) {
            setRevealedSubtitlePages(prev => new Set(prev).add(targetPid));
          }
          setCurrentStep(nextStep - 1);
        } else {
          requestAnimationFrame(() => {
            runStepAction();
            editor.setCameraOptions({ isLocked: true });
            handleCamera();
            playStepAudio(step);
            playPageCountdownSound(nextStep);
            setCurrentStep(nextStep);
          });
        }
      });
      return;
    }

    // Check if camera will move — if so, delay the step animation
    const currentCam = editor.getCamera();
    const stepCam = step.cameraPosition;
    const cameraWillMove = stepCam && (
      Math.abs(currentCam.x - stepCam.x) > 1 ||
      Math.abs(currentCam.y - stepCam.y) > 1 ||
      Math.abs(currentCam.z - stepCam.z) > 0.01
    );

    if (cameraWillMove) {
      // First press: move camera only, store step for second press
      handleCamera();
      setCurrentStep(nextStep);
      pendingCameraStepRef.current = { nextStep, step };
    } else {
      runStepAction();
      handleCamera();
      playStepAudio(step);
      playPageCountdownSound(nextStep);
      setCurrentStep(nextStep);
    }

    function runStepAction() {
      switch (action) {
        case 'none': break;
        case 'enter': {
          applyAnimationState(editor!, animationSteps, nextStep);
          // Skip CSS animation if animation is 'none' — shape just appears instantly
          if (step.animation !== 'none') {
            applyStepAnimation(step.shapeIds, step.animation, step.duration);
          }
          step.shapeIds.forEach(shapeId => {
            const config = shapeAnimations[shapeId];
            if (config?.idle && config.idle !== 'none') {
              applyIdleAnimation(shapeId, config.idle);
            }
          });
          break;
        }
        case 'exit': {
          // Instant erase — no fade animation, just hide immediately
          applyAnimationState(editor!, animationSteps, nextStep);
          break;
        }
        case 'blink': {
          applyBlinkAnimation(step.shapeIds, step.duration);
          break;
        }
        case 'move': {
          if (step.targetPosition) {
            const records = applyMoveAnimation(step.shapeIds, step.targetPosition, step.duration, editor!);
            moveOriginalPositionsRef.current[step.id] = records;
          }
          break;
        }
        case 'teleport': {
          if (step.targetPosition) {
            const records = applyTeleportAnimation(step.shapeIds, step.targetPosition, step.duration, editor!);
            moveOriginalPositionsRef.current[step.id] = records;
          }
          break;
        }
        case 'swap': {
          applyAnimationState(editor!, animationSteps, nextStep);
          applyStepAnimation(step.shapeIds, step.animation, step.duration);
          break;
        }
        default: {
          applyAnimationState(editor!, animationSteps, nextStep);
          applyStepAnimation(step.shapeIds, step.animation, step.duration);
          break;
        }
      }
    }

    function handleCamera() {
      // Camera movement — skip if already at the captured position
      if (step.cameraPosition) {
        const savedCam = applyZoomToShapes(step.shapeIds, step.duration, editor!, step.cameraPosition);
        if (savedCam) {
          zoomSavedCamerasRef.current[step.id] = savedCam;
        }
      }
    }

  }, [editor, isLocked, currentStep, animationSteps, shapeAnimations, ensureShapesVisible, applyAnimationState, playStepAudio, playPageCountdownSound, revealedTopicPages, revealedSubtitlePages]);

  const goPrevious = useCallback(() => {
    if (!editor || !isLocked) return;

    const pid = editor.getCurrentPageId() as string;
    const tMode = pageTopicModesRef.current[pid];
    const sMode = pageSubtitleModesRef.current[pid];
    const hasTopic = pid in (canvasTopicRef.current || {});
    const hasSubtitle = pid in (canvasSubtitlesRef.current || {});
    const subtitleNeedsStep = hasSubtitle && sMode === 'animate';
    const topicNeedsStep = hasTopic && tMode === 'animate';

    // If we're at step -1 or step 0 and virtual steps are revealed, reverse them
    if (currentStep <= 0) {
      // First un-reveal subtitle, then topic (reverse order)
      if (subtitleNeedsStep && revealedSubtitlePages.has(pid)) {
        setRevealedSubtitlePages(prev => { const next = new Set(prev); next.delete(pid); return next; });
        if (currentStep === 0) {
          // Also need to revert step 0
          // But actually if currentStep is 0, that means real steps have started
          // We should go back to step -1 first, then virtual steps
        }
        return;
      }
      if (topicNeedsStep && revealedTopicPages.has(pid)) {
        setRevealedTopicPages(prev => { const next = new Set(prev); next.delete(pid); return next; });
        return;
      }
    }

    if (currentStep < 0) return;
    // Stop any in-progress camera animation to prevent overlap
    editor.stopCameraAnimation();
    // Stop any playing audio
    stopStepAudio();

    const step = animationSteps[currentStep];
    const action = step.action || 'enter';

    // Switch page if going back to a step on a different page
    const targetPageId = currentStep === 0
      ? animationSteps[0].pageId
      : animationSteps[currentStep - 1]?.pageId || step.pageId;
    if (targetPageId && (editor.getCurrentPageId() as string) !== targetPageId) {
      editor.setCameraOptions({ isLocked: false });
      editor.setCurrentPage(targetPageId as any);
      editor.setCameraOptions({ isLocked: true });
    }

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
  }, [editor, isLocked, currentStep, animationSteps, applyAnimationState, stopStepAudio, revealedTopicPages, revealedSubtitlePages]);

  // Jump to the first step of a specific page (for testing)
  const jumpToPage = useCallback((pageId: string) => {
    if (!editor || !isLocked) return;
    stopStepAudio();

    // Find the first step of this page
    const targetStepIndex = animationSteps.findIndex(s => s.pageId === pageId);
    if (targetStepIndex === -1) return;

    // Pre-hide all shapes on the target page (same technique as page switch during presentation)
    const targetPageSteps = animationSteps.filter(s => s.pageId === pageId);
    const allTargetShapeIds = targetPageSteps.flatMap(s => s.shapeIds);
    const preloadedOnTarget = new Set(
      targetPageSteps
        .filter(s => s.animation === 'none' && (s.action || 'enter') === 'enter')
        .flatMap(s => s.shapeIds)
    );

    const hideStyle = document.createElement('style');
    hideStyle.id = 'page-jump-hide';
    hideStyle.textContent = allTargetShapeIds
      .filter(id => !preloadedOnTarget.has(id))
      .map(id => id.includes(':')
        ? `[data-shape-id="${id}"] { visibility: hidden !important; opacity: 0 !important; }`
        : `[data-id="${id}"] { visibility: hidden !important; opacity: 0 !important; }`)
      .join('\n');
    document.head.appendChild(hideStyle);

    // Switch to page
    editor.setCameraOptions({ isLocked: false });
    editor.setCurrentPage(pageId as any);

    // Set camera
    const pageStep = animationSteps.find(s => s.pageId === pageId && s.cameraPosition);
    if (pageStep?.cameraPosition) {
      editor.setCamera(pageStep.cameraPosition, { force: true });
    }

    requestAnimationFrame(() => {
      // Apply animation state showing only preloaded elements on this page
      // Use targetStepIndex - 1 but this only affects visible DOM (current page)
      applyAnimationState(editor, animationSteps, targetStepIndex - 1);
      hideStyle.remove();
      editor.setCameraOptions({ isLocked: true });
      setCurrentStep(targetStepIndex - 1);
    });
  }, [editor, isLocked, animationSteps, applyAnimationState, stopStepAudio]);

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
      // Flip selected shapes horizontally (Shift+H)
      if (!isLocked && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        const ids = editor?.getSelectedShapeIds();
        if (ids && ids.length > 0) editor?.flipShapes(ids, 'horizontal');
        return;
      }
      if (isLocked) {
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrevious(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, goNext, goPrevious]);

  // ─── Multi-line paste splitter ──────────────────────────────────────────
  // When pasting text with multiple lines, create separate text shapes for each line
  useEffect(() => {
    if (!editor || isLocked) return;

    const handlePaste = (e: ClipboardEvent) => {
      // Only intercept when not editing a text shape (tldraw handles its own paste)
      const editingShapeId = editor.getEditingShapeId();
      if (editingShapeId) return; // Let tldraw handle paste inside text shapes

      // Don't intercept if focus is on an input/textarea (e.g., timeline, sidebar)
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      // Only split if there are multiple non-empty lines (real multi-line content)
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      if (lines.length <= 1) return; // Single line or empty — let tldraw handle normally

      // Also check: if clipboard has HTML or tldraw internal data, let tldraw handle it
      // (user might be pasting shapes copied from tldraw itself)
      const tldrawData = e.clipboardData?.getData('application/tldraw');
      if (tldrawData) return; // tldraw internal copy-paste
      const html = e.clipboardData?.getData('text/html');
      if (html && html.includes('data-tldraw')) return;

      // If HTML has list items, extract text with bullet prefixes and nesting depth
      let finalLines: { text: string; indent: number }[] = lines.map(l => {
        // Calculate indent from leading whitespace
        const match = l.match(/^(\s*)/);
        const leadingSpaces = match ? match[1].length : 0;
        // Each tab = 1 level, every 2-4 spaces = 1 level
        const tabCount = (match?.[1] || '').split('\t').length - 1;
        const spaceIndent = Math.floor((leadingSpaces - tabCount) / 2);
        const indent = tabCount + spaceIndent;
        return { text: l.trimEnd(), indent: Math.min(indent, 4) };
      });

      if (html && (html.includes('<li') || html.includes('<ul') || html.includes('<ol'))) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const listItems = doc.querySelectorAll('li');

          if (listItems.length > 0) {
            const items: { text: string; indent: number }[] = [];
            const orderedCounters: Record<number, number> = {};

            listItems.forEach(li => {
              // Google Docs uses aria-level for nesting depth (flat <li> list)
              const ariaLevel = parseInt(li.getAttribute('aria-level') || '1', 10);
              const depth = ariaLevel - 1; // 0-based

              // Get direct text content
              let directText = '';
              for (const node of Array.from(li.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                  directText += node.textContent || '';
                } else if (node.nodeType === Node.ELEMENT_NODE && !(node as Element).matches('ul, ol')) {
                  directText += (node as Element).textContent || '';
                }
              }
              directText = directText.trim();
              if (!directText) return;

              // Determine bullet style
              const listStyle = li.style?.listStyleType || '';
              const isOrdered = listStyle === 'decimal' || li.parentElement?.tagName === 'OL';

              if (isOrdered) {
                orderedCounters[depth] = (orderedCounters[depth] || 0) + 1;
                const prefix = '  '.repeat(depth) + `${orderedCounters[depth]}. `;
                items.push({ text: prefix + directText, indent: depth });
              } else {
                const bullet = depth === 0 ? '• ' : '  '.repeat(depth) + '◦ ';
                items.push({ text: bullet + directText, indent: depth });
              }
            });

            if (items.length > 0) {
              finalLines = items;
            }
          }
        } catch { /* fallback to plain text lines */ }
      }

      // Intercept the paste
      e.preventDefault();
      e.stopImmediatePropagation();

      // Flag so auto-add doesn't block these shapes (> 5 guard)
      multiLinePasteRef.current = true;

      // Get camera center as starting position
      const viewportCenter = editor.getViewportScreenCenter();
      const pagePoint = editor.screenToPage(viewportCenter);

      const INDENT_WIDTH = 30;
      // Use 80% of viewport width for text, so lines match what you see on screen
      const viewportBounds = editor.getViewportPageBounds();
      const TEXT_WIDTH = Math.max(600, viewportBounds.w * 0.7);
      const startX = pagePoint.x - TEXT_WIDTH / 2;
      const startY = pagePoint.y - (finalLines.length * 30) / 2;

      const shapeIds: string[] = [];

      finalLines.forEach((line, i) => {
        const id = createShapeId();
        editor.createShape({
          id,
          type: 'text',
          x: startX + (line.indent * INDENT_WIDTH),
          y: startY + i * 40,
          props: {
            richText: toRichText(line.text),
            size: 'm',
            autoSize: false,
            w: TEXT_WIDTH - (line.indent * INDENT_WIDTH),
          },
        });
        shapeIds.push(id);
      });

      if (shapeIds.length > 0) {
        // Register as a paste group for auto-reflow
        const groupId = `paste-${Date.now()}`;
        pasteGroupsRef.current.set(groupId, shapeIds.map(id => id as string));

        // After tldraw measures the shapes, reposition and create container frame
        setTimeout(() => {
          const GAP = 10;
          let currentY = startY;

          for (const sid of shapeIds) {
            const shape = editor.getShape(sid as any) as any;
            const bounds = editor.getShapePageBounds(sid as any);
            if (!shape || !bounds) continue;
            if (shape.y !== currentY) {
              editor.updateShape({ id: shape.id, type: shape.type, y: currentY });
            }
            shapeHeightsRef.current.set(sid as string, bounds.h);
            currentY += bounds.h + GAP;
          }

          // Store paste group info for later frame creation (when Boundary toggle is ON)
          pasteFrameRef.current.set(groupId, {
            frameId: '', // no frame yet — created on demand
            baseX: startX,
            textWidth: TEXT_WIDTH,
          });

          // Select all text shapes
          editor.select(...shapeIds as any);
        }, 200);
      }
    };

    // Window capture phase — fires before tldraw's paste handler
    window.addEventListener('paste', handlePaste, true);
    return () => window.removeEventListener('paste', handlePaste, true);
  }, [editor, isLocked]);

  // ─── Auto-reflow paste groups when text shapes resize ───────────────────
  useEffect(() => {
    if (!editor || isLocked) return;
    const GAP = 10;

    const handleReflow = () => {
      // Only reflow when Boundary mode is active
      if (!showTextBoundaryRef.current) return;
      // Don't reflow while user is dragging/resizing
      if (editor.getInstanceState().isChangingStyle) return;
      const selectedIds = new Set(editor.getSelectedShapeIds().map(id => id as string));

      for (const [groupId, shapeIds] of pasteGroupsRef.current.entries()) {
        // Check if any shape in this group still exists
        const existingIds = shapeIds.filter(sid => editor.getShape(sid as any));
        if (existingIds.length === 0) {
          pasteGroupsRef.current.delete(groupId);
          continue;
        }

        // Skip if any shape in this group is currently selected (being dragged)
        if (existingIds.some(sid => selectedIds.has(sid))) continue;

        // Get shapes in their ORIGINAL paste order (not sorted by y — user may have moved them)
        const shapesWithBounds = existingIds
          .map(sid => {
            const shape = editor.getShape(sid as any) as any;
            const bounds = editor.getShapePageBounds(sid as any);
            return shape && bounds ? { id: sid, shape, bounds } : null;
          })
          .filter(Boolean) as { id: string; shape: any; bounds: any }[];

        if (shapesWithBounds.length < 2) continue;

        // Only reflow if a shape's HEIGHT changed (not position)
        let needsReflow = false;
        for (const { id, bounds } of shapesWithBounds) {
          const prevHeight = shapeHeightsRef.current.get(id);
          if (prevHeight !== undefined && Math.abs(prevHeight - bounds.h) > 1) {
            needsReflow = true;
          }
          shapeHeightsRef.current.set(id, bounds.h);
        }

        if (!needsReflow) continue;

        // Reflow: position each shape below the previous one with consistent gap
        for (let i = 1; i < shapesWithBounds.length; i++) {
          const prev = shapesWithBounds[i - 1];
          const curr = shapesWithBounds[i];
          const expectedY = prev.bounds.y + prev.bounds.h + GAP;
          if (Math.abs(curr.shape.y - expectedY) > 1) {
            editor.updateShape({
              id: curr.shape.id,
              type: curr.shape.type,
              y: expectedY,
            });
          }
        }
      }
    };

    const unsub = editor.store.listen(handleReflow, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked]);

  // ─── Paste group width sync — resize all text shapes when one is resized ──
  useEffect(() => {
    if (!editor || isLocked) return;

    const handleWidthSync = () => {
      // Only sync when Boundary mode is active
      if (!showTextBoundaryRef.current) return;
      // Check if any selected shape belongs to a paste group
      const selectedIds = new Set(editor.getSelectedShapeIds().map(id => id as string));
      if (selectedIds.size !== 1) return;

      const selectedId = [...selectedIds][0];
      let groupId: string | null = null;
      let groupShapeIds: string[] = [];

      for (const [gid, sids] of pasteGroupsRef.current.entries()) {
        if (sids.includes(selectedId)) {
          groupId = gid;
          groupShapeIds = sids;
          break;
        }
      }
      if (!groupId || groupShapeIds.length < 2) return;

      // Get the resized shape's current width
      const selectedShape = editor.getShape(selectedId as any) as any;
      if (!selectedShape || selectedShape.type !== 'text') return;
      const newWidth = selectedShape.props?.w;
      if (!newWidth) return;

      // Find this shape's indent level by comparing x positions
      const firstShape = editor.getShape(groupShapeIds[0] as any) as any;
      if (!firstShape) return;
      const baseX = firstShape.x;
      const selectedIndent = Math.round((selectedShape.x - baseX) / 30);

      // Apply the same effective width to all shapes in the group (adjusting for indent)
      const baseWidth = newWidth + selectedIndent * 30;
      for (const sid of groupShapeIds) {
        if (sid === selectedId) continue;
        const shape = editor.getShape(sid as any) as any;
        if (!shape || shape.type !== 'text') continue;
        const indent = Math.round((shape.x - baseX) / 30);
        const targetW = baseWidth - indent * 30;
        if (targetW > 50 && Math.abs((shape.props?.w || 0) - targetW) > 5) {
          editor.updateShape({
            id: shape.id,
            type: shape.type,
            props: { ...shape.props, w: targetW },
          });
        }
      }
    };

    const unsub = editor.store.listen(handleWidthSync, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked]);

  // ─── Frame container resize → adjust all text shapes in paste group ─────
  useEffect(() => {
    if (!editor || isLocked) return;
    const FRAME_PADDING = 12;
    const INDENT_WIDTH = 30;
    const GAP = 10;

    // Track last known frame widths to detect changes
    const lastFrameWidths = new Map<string, number>();

    const handleFrameResize = () => {
      // Only handle frame resize when Boundary mode is active
      if (!showTextBoundaryRef.current) return;
      for (const [groupId, frameInfo] of pasteFrameRef.current.entries()) {
        const frame = editor.getShape(frameInfo.frameId as any) as any;
        if (!frame) {
          pasteFrameRef.current.delete(groupId);
          continue;
        }

        const currentFrameW = frame.props?.w;
        if (!currentFrameW) continue;

        const lastW = lastFrameWidths.get(groupId) || (frameInfo.textWidth + FRAME_PADDING * 2);
        if (Math.abs(currentFrameW - lastW) < 2) continue;
        lastFrameWidths.set(groupId, currentFrameW);

        const shapeIds = pasteGroupsRef.current.get(groupId);
        if (!shapeIds || shapeIds.length === 0) continue;

        // New text width based on frame width
        const newTextWidth = currentFrameW - FRAME_PADDING * 2;
        if (newTextWidth < 100) continue;

        // Get the base X from the frame
        const newBaseX = frame.x + FRAME_PADDING;

        // Update each text shape's width and x position
        for (const sid of shapeIds) {
          const shape = editor.getShape(sid as any) as any;
          if (!shape || shape.type !== 'text') continue;

          const indent = Math.round((shape.x - frameInfo.baseX) / INDENT_WIDTH);
          const clampedIndent = Math.max(0, indent);
          const shapeW = newTextWidth - clampedIndent * INDENT_WIDTH;
          if (shapeW < 50) continue;

          const updates: any = { id: shape.id, type: shape.type };
          if (Math.abs((shape.props?.w || 0) - shapeW) > 2) {
            updates.props = { ...shape.props, w: shapeW };
          }
          updates.x = newBaseX + clampedIndent * INDENT_WIDTH;

          editor.updateShape(updates);
        }

        // Update stored base X and text width
        frameInfo.baseX = newBaseX;
        frameInfo.textWidth = newTextWidth;

        // Reflow vertically after width changes
        setTimeout(() => {
          const existingIds = shapeIds.filter(sid => editor.getShape(sid as any));
          let currentY = frame.y + FRAME_PADDING;
          let totalH = 0;

          for (const sid of existingIds) {
            const shape = editor.getShape(sid as any) as any;
            const bounds = editor.getShapePageBounds(sid as any);
            if (!shape || !bounds) continue;
            if (Math.abs(shape.y - currentY) > 1) {
              editor.updateShape({ id: shape.id, type: shape.type, y: currentY });
            }
            shapeHeightsRef.current.set(sid, bounds.h);
            currentY += bounds.h + GAP;
            totalH = currentY - (frame.y + FRAME_PADDING) - GAP;
          }

          // Update frame height to fit content
          const newFrameH = totalH + FRAME_PADDING * 2;
          if (Math.abs(frame.props.h - newFrameH) > 2) {
            editor.updateShape({
              id: frame.id,
              type: frame.type,
              props: { ...frame.props, h: newFrameH },
            });
          }
        }, 100);
      }
    };

    const unsub = editor.store.listen(handleFrameResize, { scope: 'document' });
    return () => unsub();
  }, [editor, isLocked]);

  // ─── Toggle text boundary frames visibility ──────────────────────────────
  useEffect(() => {
    if (!editor) return;

    if (showTextBoundary) {
      // Create frames for all paste groups that don't have one yet
      const FRAME_PADDING = 12;
      for (const [groupId, frameInfo] of pasteFrameRef.current.entries()) {
        const shapeIds = pasteGroupsRef.current.get(groupId);
        if (!shapeIds || shapeIds.length === 0) continue;

        // Delete old frame if exists
        if (frameInfo.frameId) {
          const oldFrame = editor.getShape(frameInfo.frameId as any);
          if (oldFrame) editor.deleteShapes([frameInfo.frameId as any]);
        }

        // Calculate bounds from existing shapes
        let minX = Infinity, minY = Infinity, maxY = -Infinity;
        for (const sid of shapeIds) {
          const shape = editor.getShape(sid as any) as any;
          const bounds = editor.getShapePageBounds(sid as any);
          if (!shape || !bounds) continue;
          minX = Math.min(minX, shape.x);
          minY = Math.min(minY, shape.y);
          maxY = Math.max(maxY, shape.y + bounds.h);
        }
        if (minX === Infinity) continue;

        const frameId = createShapeId();
        editor.createShape({
          id: frameId,
          type: 'geo',
          x: minX - FRAME_PADDING,
          y: minY - FRAME_PADDING,
          opacity: 0.25,
          meta: { isPasteBoundary: true },
          props: {
            geo: 'rectangle',
            w: frameInfo.textWidth + FRAME_PADDING * 2,
            h: (maxY - minY) + FRAME_PADDING * 2,
            fill: 'none',
            color: 'grey',
            dash: 'dashed',
            size: 's',
          },
        });

        frameInfo.frameId = frameId as string;
        frameInfo.baseX = minX;
        pasteFrameIdsRef.current.add(frameId as string);
      }
    } else {
      // Delete all frames
      for (const [, frameInfo] of pasteFrameRef.current.entries()) {
        if (frameInfo.frameId) {
          const frame = editor.getShape(frameInfo.frameId as any);
          if (frame) editor.deleteShapes([frameInfo.frameId as any]);
          pasteFrameIdsRef.current.delete(frameInfo.frameId);
          frameInfo.frameId = '';
        }
      }
    }
  }, [editor, showTextBoundary]);

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
    fetch('/__save-canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, topicSlug, subtopicSlug, data }),
    }).then(() => {
      setIsSaved(true);
    }).catch(() => {
      markDirty();
    });
  }, [editor, siteId, topicSlug, subtopicSlug, buildSaveData]);

  // Reset current topic's canvas (delete from disk + reload)
  const handleResetCanvas = useCallback(() => {
    if (!window.confirm(`Reset canvas for "${subtopicTitle}"?\n\nThis will delete all shapes, timeline, sub-topics, and saved data for this topic. This cannot be undone.`)) return;
    // Stop auto-save
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    isDirtyRef.current = false;
    // Delete synchronously via XMLHttpRequest (ensures completion before reload)
    const xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/__delete-canvas', false); // synchronous
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ siteId, topicSlug, subtopicSlug }));
    console.log('[reset] response:', xhr.status, xhr.responseText);
    window.location.reload();
  }, [siteId, topicSlug, subtopicSlug, subtopicTitle]);

  // Clear all devStack app data (delete all canvas files from disk)
  const handleClearAllAppData = useCallback(() => {
    if (!window.confirm('Clear ALL devStack app data?\n\nThis will delete saved canvases for EVERY topic across all portals. This cannot be undone.')) return;
    // Stop auto-save
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    isDirtyRef.current = false;
    // Delete synchronously
    const xhr = new XMLHttpRequest();
    xhr.open('DELETE', '/__delete-all-canvases', false);
    xhr.send();
    console.log('[clear-all] response:', xhr.status, xhr.responseText);
    window.location.reload();
  }, []);

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

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = useCallback(async () => {
    if (!editor || isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      // Enter fullscreen for full canvas capture
      const wasFullscreen = !!document.fullscreenElement;
      if (!wasFullscreen) {
        try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 600)); // wait for fullscreen transition
      }

      const { toPng } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');
      const canvasArea = document.getElementById('canvas-export-area');
      if (!canvasArea) { setIsExportingPdf(false); return; }

      const pages = editor.getPages();
      const originalPageId = editor.getCurrentPageId() as string;
      const originalCam = editor.getCamera();

      const imageFilter = (node: HTMLElement) => {
        if (!(node instanceof HTMLElement)) return true;
        const cl = node.classList;
        if (cl?.contains('timeline-bar-widget')) return false;
        if (cl?.contains('sub-topic-sidebar')) return false;
        if (node.getAttribute('data-drag-handle') !== null && node.closest?.('.timeline-bar-widget')) return false;
        // Hide tldraw UI panels (zoom, navigation, toolbar)
        if (cl?.contains('tl-navigation-panel')) return false;
        if (cl?.contains('tl-zoom-menu')) return false;
        if (cl?.contains('tl-toolbar')) return false;
        if (cl?.contains('tl-style-panel')) return false;
        if (cl?.contains('tlui-navigation-panel')) return false;
        if (cl?.contains('tlui-menu-zone')) return false;
        // Generic: hide anything with tl-ui or tlui prefix that's a panel
        if (node.className && typeof node.className === 'string' && (node.className.includes('tlui-navigation') || node.className.includes('tlui-toolbar') || node.className.includes('tlui-style-panel'))) return false;
        return true;
      };

      // Capture each page
      const pageImages: string[] = [];
      const currentSteps = animationStepsRef.current;
      for (const page of pages) {
        const pageId = page.id as string;

        // Switch to page
        if (pageId !== (editor.getCurrentPageId() as string)) {
          editor.setCurrentPage(pageId as any);
        }

        // Restore camera from first step's locked camera for this page (preserves user's zoom)
        const pageStep = currentSteps.find(s => s.pageId === pageId && s.cameraPosition);
        if (pageStep?.cameraPosition) {
          editor.setCamera(pageStep.cameraPosition, { force: true });
        }

        // Make all shapes visible (remove any animation hiding)
        document.querySelectorAll('[data-shape-id]').forEach(el => {
          (el as HTMLElement).style.visibility = '';
          (el as HTMLElement).style.opacity = '';
        });
        document.querySelectorAll('.rf-anim-hidden').forEach(el => {
          el.classList.remove('rf-anim-hidden');
        });

        // Wait for render
        await new Promise(r => setTimeout(r, 500));

        // Capture
        const dataUrl = await toPng(canvasArea, {
          backgroundColor: '#f0ede8',
          pixelRatio: 1.5,
          filter: imageFilter,
        });
        // Convert PNG to JPEG for smaller file size
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.src = dataUrl;
        });
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = img.width;
        jpegCanvas.height = img.height;
        const ctx = jpegCanvas.getContext('2d')!;
        ctx.fillStyle = '#f0ede8';
        ctx.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegUrl = jpegCanvas.toDataURL('image/jpeg', 0.92);
        pageImages.push(jpegUrl);
      }

      // Restore original page and camera
      if ((editor.getCurrentPageId() as string) !== originalPageId) {
        editor.setCurrentPage(originalPageId as any);
      }
      editor.setCamera(originalCam, { force: true });

      // Build PDF
      if (pageImages.length > 0) {
        // Get canvas dimensions for PDF page size
        const canvasRect = canvasArea.getBoundingClientRect();
        const pdfWidth = canvasRect.width;
        const pdfHeight = canvasRect.height;

        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
          unit: 'px',
          format: [pdfWidth, pdfHeight],
        });

        for (let i = 0; i < pageImages.length; i++) {
          if (i > 0) pdf.addPage([pdfWidth, pdfHeight], pdfWidth > pdfHeight ? 'landscape' : 'portrait');
          pdf.addImage(pageImages[i], 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }

        pdf.save(`canvas-${topicSlug}-${subtopicSlug}.pdf`);
      }

      // Exit fullscreen if we entered it
      if (!wasFullscreen && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      // Try to exit fullscreen on error
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* */ } }
    } finally {
      setIsExportingPdf(false);
    }
  }, [editor, isExportingPdf, topicSlug, subtopicSlug]);

  const [isExportingPpt, setIsExportingPpt] = useState(false);

  const handleExportPpt = useCallback(async () => {
    if (!editor || isExportingPpt) return;
    setIsExportingPpt(true);

    try {
      // Enter fullscreen for full canvas capture
      const wasFullscreen = !!document.fullscreenElement;
      if (!wasFullscreen) {
        try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 600));
      }

      const { toPng } = await import('html-to-image');
      const PptxGenJS = (await import('pptxgenjs')).default;
      const canvasArea = document.getElementById('canvas-export-area');
      if (!canvasArea) { setIsExportingPpt(false); return; }

      const pages = editor.getPages();
      const originalPageId = editor.getCurrentPageId() as string;
      const originalCam = editor.getCamera();

      const imageFilter = (node: HTMLElement) => {
        if (!(node instanceof HTMLElement)) return true;
        const cl = node.classList;
        if (cl?.contains('timeline-bar-widget')) return false;
        if (cl?.contains('sub-topic-sidebar')) return false;
        if (node.getAttribute('data-drag-handle') !== null && node.closest?.('.timeline-bar-widget')) return false;
        if (cl?.contains('tl-navigation-panel')) return false;
        if (cl?.contains('tl-zoom-menu')) return false;
        if (cl?.contains('tl-toolbar')) return false;
        if (cl?.contains('tl-style-panel')) return false;
        if (cl?.contains('tlui-navigation-panel')) return false;
        if (cl?.contains('tlui-menu-zone')) return false;
        if (node.className && typeof node.className === 'string' && (node.className.includes('tlui-navigation') || node.className.includes('tlui-toolbar') || node.className.includes('tlui-style-panel'))) return false;
        return true;
      };

      // Capture each page
      const pageImages: string[] = [];
      const currentStepsPpt = animationStepsRef.current;
      for (const page of pages) {
        const pageId = page.id as string;
        if (pageId !== (editor.getCurrentPageId() as string)) {
          editor.setCurrentPage(pageId as any);
        }
        // Restore camera from first step's locked camera for this page
        const pageStep = currentStepsPpt.find(s => s.pageId === pageId && s.cameraPosition);
        if (pageStep?.cameraPosition) {
          editor.setCamera(pageStep.cameraPosition, { force: true });
        }
        document.querySelectorAll('[data-shape-id]').forEach(el => {
          (el as HTMLElement).style.visibility = '';
          (el as HTMLElement).style.opacity = '';
        });
        document.querySelectorAll('.rf-anim-hidden').forEach(el => {
          el.classList.remove('rf-anim-hidden');
        });
        await new Promise(r => setTimeout(r, 500));

        const dataUrl = await toPng(canvasArea, {
          backgroundColor: '#f0ede8',
          pixelRatio: 1.5,
          filter: imageFilter,
        });
        // Convert to JPEG for smaller size
        const img = new Image();
        await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = img.width;
        jpegCanvas.height = img.height;
        const ctx = jpegCanvas.getContext('2d')!;
        ctx.fillStyle = '#f0ede8';
        ctx.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegUrl = jpegCanvas.toDataURL('image/jpeg', 0.92);
        pageImages.push(jpegUrl);
      }

      // Restore original page and camera
      if ((editor.getCurrentPageId() as string) !== originalPageId) {
        editor.setCurrentPage(originalPageId as any);
      }
      editor.setCamera(originalCam, { force: true });

      // Build PPTX
      if (pageImages.length > 0) {
        const canvasRect = canvasArea.getBoundingClientRect();
        const aspectRatio = canvasRect.width / canvasRect.height;
        const slideW = 10; // inches
        const slideH = slideW / aspectRatio;

        const pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'CUSTOM', width: slideW, height: slideH });
        pptx.layout = 'CUSTOM';

        for (const imgData of pageImages) {
          const slide = pptx.addSlide();
          slide.addImage({
            data: imgData,
            x: 0,
            y: 0,
            w: slideW,
            h: slideH,
          });
        }

        await pptx.writeFile({ fileName: `canvas-${topicSlug}-${subtopicSlug}.pptx` });
      }

      // Exit fullscreen if we entered it
      if (!wasFullscreen && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('PPT export failed:', err);
      if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* */ } }
    } finally {
      setIsExportingPpt(false);
    }
  }, [editor, isExportingPpt, topicSlug, subtopicSlug]);

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
          markDirty();
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
    <div className={`w-full ${isPresenting ? 'h-screen' : 'h-[calc(100vh-78px)]'} flex flex-col overflow-hidden ${bwMode ? 'bw-theme' : ''}`}>
      {/* ─── Main Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center px-4 py-3 bg-[#0f1b3d] border-b border-[#1a2a5e] flex-shrink-0 min-w-0">
        {/* Fixed left: Back + title (title hidden when unlocked for more button space) */}
        <div className="flex items-center gap-3 flex-shrink-0 mr-3" style={{ maxWidth: isLocked ? undefined : undefined }}>
          <Link to={backPath} className="flex items-center gap-1.5 text-blue-100 hover:text-blue-100 text-sm transition-colors whitespace-nowrap">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Link>
          {isLocked && (
            <>
              <div className="w-px h-5 bg-blue-900 flex-shrink-0" />
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                <span className="text-blue-200 text-sm truncate">{topicTitle}</span>
                <span className="text-blue-400 text-sm flex-shrink-0">/</span>
                <span className="text-blue-100 text-sm font-medium truncate">{subtopicTitle}</span>
              </div>
            </>
          )}
        </div>

        {/* Scrollable right: all buttons — when locked, push to right with ml-auto */}
        <div className={`flex items-center gap-2 overflow-x-auto min-w-0 ${isLocked ? 'ml-auto flex-shrink-0' : 'flex-1'}`} style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain' }}>
          {/* Step counter (locked) */}
          {isLocked && animationSteps.length > 0 && (
            <div className={`flex items-center gap-1.5 flex-shrink-0 ${!hideLockButton ? 'mr-2' : ''}`}>
              <button onClick={goPrevious} disabled={currentStep < 0} className="p-1 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="w-3.5 h-3.5 text-blue-100" />
              </button>
              <span className="text-blue-100 text-xs font-medium min-w-[40px] text-center" style={{ display: isPresenting ? 'none' : undefined }}>
                {currentStep + 1} / {animationSteps.length}
              </span>
              <button onClick={goNext} disabled={currentStep >= animationSteps.length - 1} className="p-1 rounded bg-blue-900 hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="w-3.5 h-3.5 text-blue-100" />
              </button>
              {/* Page jump — hidden in fullscreen presenting */}
              {!isPresenting && editor && editor.getPages().length > 1 && (
                <select
                  value={currentStep >= 0 ? (animationSteps[currentStep]?.pageId || '') : ''}
                  onChange={(e) => { if (e.target.value) jumpToPage(e.target.value); }}
                  className="ml-1 text-[9px] bg-blue-900 text-blue-200 border border-blue-700 rounded px-1 py-1 outline-none cursor-pointer"
                  title="Jump to page"
                >
                  <option value="" disabled>Jump to...</option>
                  {editor.getPages().map((p, i) => (
                    <option key={p.id as string} value={p.id as string}>
                      {p.name || `Page ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Lock/Unlock — hidden when presenting or public canvas is open */}
          {!hideLockButton && !isPresenting && !showPublicCanvas && (
            <button onClick={toggleLock} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-shrink-0 outline-none focus:outline-none ${isLocked ? 'bg-blue-900 text-blue-100 hover:bg-blue-800 border border-blue-800' : 'bg-emerald-600 text-white hover:bg-emerald-600/30 border border-emerald-500/30'}`}>
              {isLocked ? <><Lock className="w-3.5 h-3.5" />Locked</> : <><Unlock className="w-3.5 h-3.5" />Unlocked</>}
            </button>
          )}

          {/* Save + auto-save indicator */}
          {!isLocked && (
            <>
            <button onClick={handleSave} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${isSaved ? 'bg-blue-900 text-blue-300' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
              <Save className="w-3.5 h-3.5" />{isSaved ? 'Saved' : 'Save'}
            </button>
            {lastSavedAt !== null && (
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${autoSaveHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}
                title={autoSaveHealthy ? 'Auto-save active' : 'Auto-save failed — save manually'}
              />
            )}
            </>
          )}

          {/* Export / Import */}
          {!isLocked && (
            <>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0" title="Export as JSON">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleExportPng} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0" title="Export as PNG">
                <ImageDown className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleExportPdf} disabled={isExportingPdf} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${isExportingPdf ? 'bg-amber-700 text-amber-200 cursor-wait' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`} title="Export as PDF (all pages)">
                <FileText className="w-3.5 h-3.5" />{isExportingPdf ? '...' : 'PDF'}
              </button>
              <button onClick={handleExportPpt} disabled={isExportingPpt} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${isExportingPpt ? 'bg-amber-700 text-amber-200 cursor-wait' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`} title="Export as PowerPoint (all pages)">
                <Boxes className="w-3.5 h-3.5" />{isExportingPpt ? '...' : 'PPT'}
              </button>
              <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0" title="Import JSON">
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleResetCanvas} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 text-red-200 hover:bg-red-800/60 transition-all flex-shrink-0" title="Reset this canvas">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleClearAllAppData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/40 text-red-300 hover:bg-red-800/40 transition-all flex-shrink-0" title="Clear all app data">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Panel toggle buttons (unlocked) */}
          {!isLocked && (
            <>
              <button onClick={() => setShowLineConfig(!showLineConfig)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showLineConfig ? 'bg-cyan-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                Lines
              </button>
              <button onClick={() => setShowAnimBar(!showAnimBar)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showAnimBar ? 'bg-purple-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                <Palette className="w-3 h-3" />
                Colors
              </button>
              <button onClick={() => setShowNodes(!showNodes)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showNodes ? 'bg-emerald-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
                <Boxes className="w-3 h-3" />
                Nodes
              </button>
              <button onClick={() => { const next = !showTextBoundary; setShowTextBoundary(next); showTextBoundaryRef.current = next; }} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showTextBoundary ? 'bg-amber-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`} title="Show/hide text paste boundaries">
                <AlignJustify className="w-3 h-3" />
                Boundary
              </button>
              <button onClick={() => setShowSidebar(s => !s)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showSidebar ? 'bg-blue-900 text-blue-100 hover:bg-blue-800' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}>
                <PanelRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  if (!editor) return;
                  const { x, y } = editor.getViewportScreenCenter();
                  const point = editor.screenToPage({ x, y });
                  editor.createShape({ type: 'code-block' as any, x: point.x - 250, y: point.y - 150 });
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0"
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
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0"
              >
                <FileText className="w-3 h-3" />
                Markdown
              </button>
              {/* Flip selected shapes horizontally */}
              <button
                onClick={() => {
                  if (!editor) return;
                  const ids = editor.getSelectedShapeIds();
                  if (ids.length > 0) {
                    editor.markHistoryStoppingPoint('flip horizontal');
                    editor.flipShapes(ids, 'horizontal');
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0"
                title="Flip selected shapes horizontally"
              >
                <FlipHorizontal2 className="w-3 h-3" />
                Flip
              </button>
              {/* Guide border toggle */}
              <button
                onClick={() => setShowGuideBorder(v => !v)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showGuideBorder ? 'bg-orange-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}
                title="Show/hide presentation guide border (visible area at 75% zoom)"
              >
                <Frame className="w-3 h-3" />
                Guide
              </button>
              {/* 75% zoom button */}
              <button
                onClick={() => {
                  if (!editor) return;
                  const cam = editor.getCamera();
                  editor.setCamera({ ...cam, z: 0.75 }, { force: true, animation: { duration: 300 } });
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-900 text-blue-100 hover:bg-blue-800 transition-all flex-shrink-0"
                title="Set zoom to 75%"
              >
                75%
              </button>
              {/* B&W theme toggle */}
              <button
                onClick={() => { setBwMode(v => !v); markDirty(); }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${bwMode ? 'bg-gray-800 text-white border border-white/30' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}
                title="Toggle black & white theme"
              >
                B&W
              </button>
              {/* Topic / Subtitle strip toggles */}
              <button
                onClick={() => {
                  if (!editor) return;
                  const pid = editor.getCurrentPageId() as string;
                  if (pageTopicVisible.has(pid)) {
                    setPageTopicVisible(prev => { const next = new Set(prev); next.delete(pid); return next; });
                  } else {
                    // Initialize data if never added before
                    if (!(pid in pageTopics)) setPageTopics(prev => ({ ...prev, [pid]: '' }));
                    setPageTopicVisible(prev => new Set(prev).add(pid));
                  }
                  markDirty();
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${editor && pageTopicVisible.has(editor.getCurrentPageId() as string) ? 'bg-rose-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}
                title="Show/hide topic for this page"
              >
                Topic
              </button>
              <button
                onClick={() => {
                  if (!editor) return;
                  const pid = editor.getCurrentPageId() as string;
                  if (pageSubtitleVisible.has(pid)) {
                    setPageSubtitleVisible(prev => { const next = new Set(prev); next.delete(pid); return next; });
                  } else {
                    if (!(pid in pageSubtitles)) setPageSubtitles(prev => ({ ...prev, [pid]: '' }));
                    setPageSubtitleVisible(prev => new Set(prev).add(pid));
                  }
                  markDirty();
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${editor && pageSubtitleVisible.has(editor.getCurrentPageId() as string) ? 'bg-teal-500 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}
                title="Show/hide subtitle for this page"
              >
                Subtitle
              </button>
            </>
          )}
          {/* Public canvas toggle — hidden when presenting */}
          {!isPresenting && (
            <button onClick={() => setShowPublicCanvas(!showPublicCanvas)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${showPublicCanvas ? 'bg-emerald-600 text-white' : 'bg-blue-900 text-blue-100 hover:bg-blue-800'}`}>
              <Eye className="w-3 h-3" />
              Public
            </button>
          )}
        </div>
      </div>


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
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas column (fixed 85% width) — includes topic strip + canvas */}
        <div className="w-[85%] flex flex-col overflow-hidden">
          {/* Topic / Subtitle strip above canvas — per page */}
          {editor && (() => {
            const pid = editor.getCurrentPageId() as string;
            const hasTopic = pageTopicVisible.has(pid);
            const hasSubtitle = pageSubtitleVisible.has(pid);
            if (!hasTopic && !hasSubtitle) return null;
            const tText = pageTopics[pid] || '';
            const sText = pageSubtitles[pid] || '';
            const tColor = pageTopicColors[pid] || '#1e293b';
            const tBorder = pageTopicBorderColors[pid] || '#1e293b';
            const sColor = pageSubtitleColors[pid] || '#1e293b';
            const sBorder = pageSubtitleBorderColors[pid] || '#1e293b';
            const tAnim = pageTopicAnimations[pid] || 'none';
            const sAnim = pageSubtitleAnimations[pid] || 'none';
            const tMode = pageTopicModes[pid] || 'preload';
            const sMode = pageSubtitleModes[pid] || 'preload';
            const tVisible = !isLocked || tMode === 'preload' || revealedTopicPages.has(pid);
            const sVisible = !isLocked || sMode === 'preload' || revealedSubtitlePages.has(pid);
            // For animation: only play the CSS animation when it was just revealed (animate mode + revealed)
            const tPlayAnim = isLocked && tAnim !== 'none' && (tMode === 'preload' || revealedTopicPages.has(pid));
            const sPlayAnim = isLocked && sAnim !== 'none' && (sMode === 'preload' || revealedSubtitlePages.has(pid));
            return (
              <div className="flex-shrink-0 bg-[#f0ede8] px-2 py-1 flex flex-col gap-2">
                {hasTopic && (
                  <div key={`topic-${pid}`} className="flex justify-center" style={{ visibility: tVisible ? 'visible' : 'hidden', opacity: tVisible ? 1 : 0, transition: 'opacity 0.3s' }}>
                    <div className={`relative border-2 rounded inline-flex items-center ${tPlayAnim ? `step-anim-${tAnim}` : ''}`} style={{ padding: '1px 4px', borderColor: tBorder }}>
                      <div className="inline-grid items-center">
                        <span className="invisible whitespace-pre col-start-1 row-start-1 font-bold" style={{ fontFamily: 'tldraw_serif, Georgia, serif', fontSize: 26 }}>{tText || 'Topic'}</span>
                        <input
                          type="text"
                          value={tText}
                          onChange={(e) => { setPageTopics(prev => ({ ...prev, [pid]: e.target.value })); markDirty(); }}
                          placeholder="Topic"
                          readOnly={isLocked}
                          className="bg-transparent font-bold outline-none placeholder:text-[#94a3b8] placeholder:font-normal text-center col-start-1 row-start-1"
                          style={{ fontFamily: 'tldraw_serif, Georgia, serif', fontSize: 26, width: 0, minWidth: '100%', color: tColor }}
                        />
                      </div>
                      {!isLocked && (
                        <button onClick={() => { setTopicColorPickerOpen(v => !v); setSubtitleColorPickerOpen(false); }} className="ml-1 w-4 h-4 rounded-full border border-slate-300 flex-shrink-0" style={{ background: tColor }} title="Change color" />
                      )}
                      {topicColorPickerOpen && !isLocked && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="text-[8px] text-slate-500 font-medium">Text</div>
                          <div className="flex gap-1 flex-wrap" style={{ maxWidth: 140 }}>
                            {['#1e293b','#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#eab308','#9ca3af','#ffffff'].map(c => (
                              <button key={`tt-${c}`} onClick={() => { setPageTopicColors(prev => ({ ...prev, [pid]: c })); markDirty(); }} className={`w-5 h-5 rounded-full border ${tColor === c ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'}`} style={{ background: c }} />
                            ))}
                          </div>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Border</div>
                          <div className="flex gap-1 flex-wrap" style={{ maxWidth: 140 }}>
                            {['#1e293b','#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#eab308','#9ca3af','transparent'].map(c => (
                              <button key={`tb-${c}`} onClick={() => { setPageTopicBorderColors(prev => ({ ...prev, [pid]: c })); markDirty(); }} className={`w-5 h-5 rounded-full border ${tBorder === c ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'} ${c === 'transparent' ? 'bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-[length:8px_8px]' : ''}`} style={c !== 'transparent' ? { background: c } : {}} />
                            ))}
                          </div>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Animation</div>
                          <select
                            value={pageTopicAnimations[pid] || 'none'}
                            onChange={(e) => { setPageTopicAnimations(prev => ({ ...prev, [pid]: e.target.value })); markDirty(); }}
                            className="text-[9px] border border-slate-300 rounded px-1 py-0.5 bg-white text-slate-700 w-full"
                          >
                            <option value="none">None</option>
                            <option value="appear">Appear</option>
                            <option value="revealLeft">Reveal L→R</option>
                            <option value="revealRight">Reveal R→L</option>
                            <option value="revealTop">Reveal T→D</option>
                            <option value="revealBottom">Reveal B→U</option>
                            <option value="revealCenter">Reveal Center</option>
                          </select>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Step</div>
                          <div className="flex gap-2">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`topic-mode-${pid}`} checked={(pageTopicModes[pid] || 'preload') === 'preload'} onChange={() => { setPageTopicModes(prev => ({ ...prev, [pid]: 'preload' })); markDirty(); }} className="w-3 h-3 accent-blue-500" />
                              <span className="text-[8px] text-slate-600">Preload</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`topic-mode-${pid}`} checked={(pageTopicModes[pid] || 'preload') === 'animate'} onChange={() => { setPageTopicModes(prev => ({ ...prev, [pid]: 'animate' })); markDirty(); }} className="w-3 h-3 accent-blue-500" />
                              <span className="text-[8px] text-slate-600">Animate</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hasSubtitle && (
                  <div key={`subtitle-${pid}`} className="flex justify-start" style={{ visibility: sVisible ? 'visible' : 'hidden', opacity: sVisible ? 1 : 0, transition: 'opacity 0.3s' }}>
                    <div className={`relative border-2 rounded inline-flex items-center ${sPlayAnim ? `step-anim-${sAnim}` : ''}`} style={{ padding: '1px 4px', borderColor: sBorder }}>
                      <div className="inline-grid items-center">
                        <span className="invisible whitespace-pre col-start-1 row-start-1 font-bold" style={{ fontFamily: 'tldraw_serif, Georgia, serif', fontSize: 22 }}>{sText || 'Subtitle'}</span>
                        <input
                          type="text"
                          value={sText}
                          onChange={(e) => { setPageSubtitles(prev => ({ ...prev, [pid]: e.target.value })); markDirty(); }}
                          placeholder="Subtitle"
                          readOnly={isLocked}
                          className="bg-transparent font-bold outline-none placeholder:text-[#94a3b8] placeholder:font-normal col-start-1 row-start-1"
                          style={{ fontFamily: 'tldraw_serif, Georgia, serif', fontSize: 22, width: 0, minWidth: '100%', color: sColor }}
                        />
                      </div>
                      {!isLocked && (
                        <button onClick={() => { setSubtitleColorPickerOpen(v => !v); setTopicColorPickerOpen(false); }} className="ml-1 w-4 h-4 rounded-full border border-slate-300 flex-shrink-0" style={{ background: sColor }} title="Change color" />
                      )}
                      {subtitleColorPickerOpen && !isLocked && (
                        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="text-[8px] text-slate-500 font-medium">Text</div>
                          <div className="flex gap-1 flex-wrap" style={{ maxWidth: 140 }}>
                            {['#1e293b','#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#eab308','#9ca3af','#ffffff'].map(c => (
                              <button key={`st-${c}`} onClick={() => { setPageSubtitleColors(prev => ({ ...prev, [pid]: c })); markDirty(); }} className={`w-5 h-5 rounded-full border ${sColor === c ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'}`} style={{ background: c }} />
                            ))}
                          </div>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Border</div>
                          <div className="flex gap-1 flex-wrap" style={{ maxWidth: 140 }}>
                            {['#1e293b','#3b82f6','#ef4444','#22c55e','#f97316','#8b5cf6','#eab308','#9ca3af','transparent'].map(c => (
                              <button key={`sb-${c}`} onClick={() => { setPageSubtitleBorderColors(prev => ({ ...prev, [pid]: c })); markDirty(); }} className={`w-5 h-5 rounded-full border ${sBorder === c ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-300'} ${c === 'transparent' ? 'bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-[length:8px_8px]' : ''}`} style={c !== 'transparent' ? { background: c } : {}} />
                            ))}
                          </div>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Animation</div>
                          <select
                            value={pageSubtitleAnimations[pid] || 'none'}
                            onChange={(e) => { setPageSubtitleAnimations(prev => ({ ...prev, [pid]: e.target.value })); markDirty(); }}
                            className="text-[9px] border border-slate-300 rounded px-1 py-0.5 bg-white text-slate-700 w-full"
                          >
                            <option value="none">None</option>
                            <option value="appear">Appear</option>
                            <option value="revealLeft">Reveal L→R</option>
                            <option value="revealRight">Reveal R→L</option>
                            <option value="revealTop">Reveal T→D</option>
                            <option value="revealBottom">Reveal B→U</option>
                            <option value="revealCenter">Reveal Center</option>
                          </select>
                          <div className="text-[8px] text-slate-500 font-medium mt-1">Step</div>
                          <div className="flex gap-2">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`subtitle-mode-${pid}`} checked={(pageSubtitleModes[pid] || 'preload') === 'preload'} onChange={() => { setPageSubtitleModes(prev => ({ ...prev, [pid]: 'preload' })); markDirty(); }} className="w-3 h-3 accent-blue-500" />
                              <span className="text-[8px] text-slate-600">Preload</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="radio" name={`subtitle-mode-${pid}`} checked={(pageSubtitleModes[pid] || 'preload') === 'animate'} onChange={() => { setPageSubtitleModes(prev => ({ ...prev, [pid]: 'animate' })); markDirty(); }} className="w-3 h-3 accent-blue-500" />
                              <span className="text-[8px] text-slate-600">Animate</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Canvas Area */}
          <div className="flex-1 relative overflow-hidden">
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
                  markDirty();
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

          {/* Timeline pill — when fully collapsed, draggable anywhere on canvas */}
          {!isLocked && timelineFullyCollapsed && (
            <DraggableWidget defaultPosition={{ x: 16, y: 60 }} zIndex={35}>
              <div
                data-drag-handle
                className="flex items-center gap-1.5 px-3 py-2 bg-[#0a1230] border border-[#1a2a5e] rounded-lg text-[10px] text-slate-400 hover:text-slate-200 hover:bg-[#0f1b3d] transition-all shadow-lg cursor-grab active:cursor-grabbing"
                title="Click to expand timeline"
                onMouseDown={(e) => { (e.currentTarget as any)._dragStartX = e.clientX; (e.currentTarget as any)._dragStartY = e.clientY; }}
                onMouseUp={(e) => {
                  const dx = Math.abs(e.clientX - ((e.currentTarget as any)._dragStartX || 0));
                  const dy = Math.abs(e.clientY - ((e.currentTarget as any)._dragStartY || 0));
                  if (dx < 5 && dy < 5) setTimelineFullyCollapsed(false); // only expand on clean click, not drag
                }}
              >
                <span className="text-slate-500 uppercase tracking-wider font-bold text-[9px]">Timeline</span>
                <span className="text-slate-600">{animationSteps.length}</span>
                <ChevronUp className="w-3 h-3" />
              </div>
            </DraggableWidget>
          )}

          {/* Guide border — shows visible area at 75% zoom, hidden when locked */}
          {showGuideBorder && !isLocked && tldrawCamera && (() => {
            void guideResizeTick; // re-render on window resize
            const container = document.getElementById('canvas-export-area');
            if (!container) return null;
            if (!editor) return null;
            const pid = editor.getCurrentPageId() as string;

            // Calculate fullscreen canvas dimensions
            // In fullscreen: window.innerHeight + 78px (app header gone) = total height
            // Then subtract toolbar and topic/subtitle strip
            const fullscreenTotalH = window.innerHeight + 78; // app header removed in fullscreen
            const screenW = window.innerWidth * 0.85 - 6; // 85% canvas column minus 3px each side
            const toolbarHeight = 47; // toolbar py-3 + content + border
            const hasTopic = pageTopicVisible.has(pid);
            const hasSubtitle = pageSubtitleVisible.has(pid);
            const topicLineH = 32;
            const subtitleLineH = 28;
            const stripContainerPy = 8;
            const stripGap = 8;
            let stripHeight = 0;
            if (hasTopic && hasSubtitle) stripHeight = stripContainerPy + topicLineH + stripGap + subtitleLineH + 30;
            else if (hasTopic) stripHeight = stripContainerPy + topicLineH + 10;
            else if (hasSubtitle) stripHeight = stripContainerPy + subtitleLineH + 10;

            const screenH = fullscreenTotalH - toolbarHeight - stripHeight - 47;

            // Page-coordinate dimensions of the viewport at 75% zoom
            const guideW = screenW / 0.75;
            const guideH = screenH / 0.75;
            const cam = tldrawCamera;
            // Convert page coords to screen coords, applying guide offset
            const screenX = (guideOffset.x + cam.x) * cam.z;
            const screenY = (guideOffset.y + cam.y) * cam.z;
            const screenWPx = guideW * cam.z;
            const screenHPx = guideH * cam.z;
            return (
              <div
                className="absolute z-[5] pointer-events-none"
                style={{
                  left: screenX,
                  top: screenY,
                  width: screenWPx,
                  height: screenHPx,
                }}
              >
                {/* Top border - draggable */}
                <div className="absolute top-0 left-0 right-0 h-[6px] cursor-grab active:cursor-grabbing" style={{ borderTop: '2px dashed rgba(251, 146, 60, 0.5)', pointerEvents: 'auto' }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    guideDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: guideOffset.x, origOffY: guideOffset.y };
                    const c = tldrawCamera;
                    const move = (ev: MouseEvent) => { if (!guideDragRef.current || !c) return; setGuideOffset({ x: guideDragRef.current.origOffX + (ev.clientX - guideDragRef.current.startX) / c.z, y: guideDragRef.current.origOffY + (ev.clientY - guideDragRef.current.startY) / c.z }); };
                    const up = () => { guideDragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
                  }}
                />
                {/* Bottom border */}
                <div className="absolute bottom-0 left-0 right-0 h-[6px] cursor-grab active:cursor-grabbing" style={{ borderBottom: '2px dashed rgba(251, 146, 60, 0.5)', pointerEvents: 'auto' }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    guideDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: guideOffset.x, origOffY: guideOffset.y };
                    const c = tldrawCamera;
                    const move = (ev: MouseEvent) => { if (!guideDragRef.current || !c) return; setGuideOffset({ x: guideDragRef.current.origOffX + (ev.clientX - guideDragRef.current.startX) / c.z, y: guideDragRef.current.origOffY + (ev.clientY - guideDragRef.current.startY) / c.z }); };
                    const up = () => { guideDragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
                  }}
                />
                {/* Left border */}
                <div className="absolute top-0 bottom-0 left-0 w-[6px] cursor-grab active:cursor-grabbing" style={{ borderLeft: '2px dashed rgba(251, 146, 60, 0.5)', pointerEvents: 'auto' }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    guideDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: guideOffset.x, origOffY: guideOffset.y };
                    const c = tldrawCamera;
                    const move = (ev: MouseEvent) => { if (!guideDragRef.current || !c) return; setGuideOffset({ x: guideDragRef.current.origOffX + (ev.clientX - guideDragRef.current.startX) / c.z, y: guideDragRef.current.origOffY + (ev.clientY - guideDragRef.current.startY) / c.z }); };
                    const up = () => { guideDragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
                  }}
                />
                {/* Right border */}
                <div className="absolute top-0 bottom-0 right-0 w-[6px] cursor-grab active:cursor-grabbing" style={{ borderRight: '2px dashed rgba(251, 146, 60, 0.5)', pointerEvents: 'auto' }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); e.preventDefault();
                    guideDragRef.current = { startX: e.clientX, startY: e.clientY, origOffX: guideOffset.x, origOffY: guideOffset.y };
                    const c = tldrawCamera;
                    const move = (ev: MouseEvent) => { if (!guideDragRef.current || !c) return; setGuideOffset({ x: guideDragRef.current.origOffX + (ev.clientX - guideDragRef.current.startX) / c.z, y: guideDragRef.current.origOffY + (ev.clientY - guideDragRef.current.startY) / c.z }); };
                    const up = () => { guideDragRef.current = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
                  }}
                />
              </div>
            );
          })()}
        </div>

        {!isLocked && !timelineFullyCollapsed && (
          <DraggableWidget defaultPosition={{ x: 0, y: 0 }} zIndex={35} anchorBottom>
            <div className="overflow-hidden shadow-2xl border border-[#1a2a5e]" style={{ width: '85vw' }}>
              <TimelineBar
                steps={animationSteps}
                onStepsChange={handleStepsChange}
                onDeleteRfElements={handleDeleteRfElements}
                editor={editor}
                isLocked={isLocked}
                diagramData={diagramData}
                selectedShapeIds={selectedShapeIds}
                fullyCollapsed={timelineFullyCollapsed}
                onFullyCollapsedChange={setTimelineFullyCollapsed}
              />
            </div>
          </DraggableWidget>
        )}
        </div>
        </div>

        {/* Sidebar (right 15%) — always rendered for layout, content conditional */}
        <div className="w-[15%] min-w-[180px] border-l border-[#1a2a5e] bg-[#0a1230] flex flex-col overflow-hidden flex-shrink-0">
          {showSidebar ? (
            isLocked ? (
              // Locked: always show Sub-topics
              <SubTopicTracker
                labels={subTopicLabels}
                onLabelsChange={handleLabelsChange}
                steps={animationSteps}
                isLocked={isLocked}
                currentStep={currentStep}
                editor={editor}
                sidebar
                sidebarTitle={sidebarTitle}
                onSidebarTitleChange={setSidebarTitle}
                collapsed={false}
                pageGlow={pageGlow}
              />
            ) : sidebarCollapsed ? (
              // Unlocked + collapsed: show Pages panel
              <PagePanel editor={editor} isLocked={isLocked} onShowTopics={() => setSidebarCollapsed(false)} />
            ) : (
              // Unlocked + expanded: show Sub-topics
              <SubTopicTracker
                labels={subTopicLabels}
                onLabelsChange={handleLabelsChange}
                steps={animationSteps}
                isLocked={isLocked}
                currentStep={currentStep}
                editor={editor}
                sidebar
                sidebarTitle={sidebarTitle}
                onSidebarTitleChange={setSidebarTitle}
                collapsed={sidebarCollapsed}
                onCollapsedChange={setSidebarCollapsed}
                pageGlow={pageGlow}
              />
            )
          ) : null}
        </div>
      </div>

      </>
      )}
    </div>
  );
}
