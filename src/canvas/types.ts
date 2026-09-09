/**
 * Canvas lesson data types.
 */

export type AnimationType =
  | 'none'
  | 'appear'
  | 'fadeIn'
  | 'fadeOut'
  | 'flyInLeft'
  | 'flyInRight'
  | 'flyInTop'
  | 'flyInBottom'
  | 'zoomIn'
  | 'zoomOut'
  | 'pop'
  | 'pulse'
  | 'bounce'
  | 'typewriter'
  | 'drawLine'
  | 'slideInLeft'
  | 'slideInRight'
  | 'slideInTop'
  | 'slideInBottom'
  | 'idleFloat'
  | 'idleShake'
  | 'idlePulse'
  | 'idleBounce'
  | 'idleBreathe'
  | 'idleWiggle'
  | 'idleSway'
  | 'revealLeft'
  | 'revealRight'
  | 'revealTop'
  | 'revealBottom'
  | 'revealCenter';

export type IdleAnimation =
  | 'none'
  | 'float'
  | 'shake'
  | 'pulse'
  | 'bounce'
  | 'breathe'
  | 'wiggle'
  | 'sway';

/**
 * Per-shape animation config (stored by shape ID).
 */
export interface ShapeAnimationConfig {
  entrance: AnimationType;
  idle: IdleAnimation;
}

export type StepAction = 'enter' | 'exit' | 'blink' | 'move' | 'teleport' | 'swap' | 'none';

export interface AnimationStep {
  id: string;
  /** IDs of tldraw shapes or React Flow elements involved in this step */
  shapeIds: string[];
  /** Animation type for this step */
  animation: AnimationType;
  /** Duration in milliseconds */
  duration: number;
  /** Label shown in the panel */
  label: string;
  /** Action type — defaults to 'enter' for backward compatibility */
  action?: StepAction;
  /** tldraw page ID this step belongs to (e.g. 'page:page1') */
  pageId?: string;
  /** Target position for move/teleport actions */
  targetPosition?: { x: number; y: number };
  /** Original position to restore when rewinding move/teleport */
  originalPosition?: { x: number; y: number };
  /** Shape IDs to exit (for swap action) */
  exitShapeIds?: string[];
  /** Captured camera position — optional for any step. If set, camera animates to this view when step plays. */
  cameraPosition?: { x: number; y: number; z: number };
  /** Optional audio clip to play when this step is reached */
  audio?: {
    /** Base64-encoded audio data (memory only — not saved to localStorage) */
    data: string;
    /** Original file name for re-upload reference */
    fileName: string;
    /** Start playback from this second */
    startTime: number;
    /** Stop playback at this second */
    endTime: number;
    /** Loop between startTime and endTime until next step */
    loop: boolean;
    /** Volume 0-1 */
    volume: number;
  };
}

/**
 * Persisted React Flow diagram data — saved alongside the tldraw snapshot.
 */
export interface DiagramData {
  nodes: unknown[];
  edges: unknown[];
  edgeType: string;
  pathType: string;
  arrowType: string;
  color: string;
}

/**
 * A sub-topic is a label + a range of pages.
 * Progress advances when all steps of a page complete.
 * Backward compatible: startStep/endStep kept for migration but startPage/endPage are preferred.
 */
export interface SubTopicLabel {
  id: string;
  title: string;
  /** @deprecated Use startPage instead */
  startStep: number;
  /** @deprecated Use endPage instead */
  endStep: number;
  /** Index of first page (0-based) in the page order */
  startPage?: number;
  /** Index of last page (0-based, inclusive) in the page order */
  endPage?: number;
}

export interface LessonCanvasData {
  /** Version for future migration */
  version: 2;
  /** Metadata */
  meta: {
    topicSlug: string;
    subtopicSlug: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  /** tldraw document snapshot (serialized) */
  snapshot: unknown;
  /** Saved camera position */
  camera?: { x: number; y: number; z: number };
  /** Flat ordered animation steps */
  animationSteps: AnimationStep[];
  /** Sub-topic labels with step ranges (progress tracker) */
  subTopicLabels: SubTopicLabel[];
  /** Per-shape animation config */
  shapeAnimations: Record<string, ShapeAnimationConfig>;
  /** React Flow diagram data (nodes, edges, toolbar settings) */
  diagramData?: DiagramData;
}

/**
 * Public markdown data — stores markdown content for the public view.
 * Rendered as a beautiful document page on production.
 */
export interface PublicCanvasData {
  version: 2;
  meta: {
    topicSlug: string;
    subtopicSlug: string;
    title: string;
    exportedAt: string;
  };
  /** Raw markdown content */
  content: string;
}
