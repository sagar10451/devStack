/**
 * DiagramEditor — React Flow canvas that sits alongside tldraw.
 * Handles nodes, edges, connections, drag-drop from sidebar, undo/redo, copy/paste.
 * Exposes selected node/edge IDs so LessonCanvas can add them to animation steps.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ConnectionMode,
  useOnSelectionChange,
  type Connection,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { edgeTypes } from './edgeTypes';
import { nodeTypes } from './nodeTypes';
import type { DiagramData, NodeCatalogItem } from './diagramTypes';

// ─── ID generation ───────────────────────────────────────────────────────────

let nodeCounter = Date.now();
const getNodeId = () => `rf-n-${nodeCounter++}`;

const NODE_W = 130;
const NODE_H = 75;
const PASTE_GAP = 40;
const MAX_HISTORY = 50;

// ─── Marker helpers ──────────────────────────────────────────────────────────

function buildMarkers(arrowType: string, color: string) {
  const marker = (t: MarkerType) => ({ type: t, color, width: 16, height: 16 });
  if (arrowType === 'arrow') return { markerEnd: marker(MarkerType.Arrow), markerStart: undefined };
  if (arrowType === 'arrowclosed') return { markerEnd: marker(MarkerType.ArrowClosed), markerStart: undefined };
  if (arrowType === 'both') return { markerStart: marker(MarkerType.ArrowClosed), markerEnd: marker(MarkerType.ArrowClosed) };
  return { markerEnd: undefined, markerStart: undefined };
}

function arrowTypeFromEdge(edge: Edge): string {
  if (edge.markerStart && edge.markerEnd) return 'both';
  if (edge.markerEnd) {
    const me = edge.markerEnd as { type?: MarkerType };
    if (me.type === MarkerType.ArrowClosed) return 'arrowclosed';
    if (me.type === MarkerType.Arrow) return 'arrow';
  }
  return 'none';
}

// ─── Bounding box helpers ────────────────────────────────────────────────────

function boundingBox(nodeList: Node[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodeList) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function wouldOverlap(existingNodes: Node[], newBB: ReturnType<typeof boundingBox>) {
  for (const n of existingNodes) {
    const nx = n.position.x, ny = n.position.y;
    const nRight = nx + NODE_W, nBottom = ny + NODE_H;
    if (newBB.minX < nRight && newBB.maxX > nx && newBB.minY < nBottom && newBB.maxY > ny) {
      return true;
    }
  }
  return false;
}

// ─── Selection tracker (child of ReactFlow) ──────────────────────────────────

function SelectionTracker({ onSelectionChange }: { onSelectionChange: (sel: { nodes: Node[]; edges: Edge[] }) => void }) {
  useOnSelectionChange({ onChange: onSelectionChange });
  return null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface DiagramEditorProps {
  diagramData: DiagramData;
  onDiagramChange: (data: DiagramData) => void;
  onSelectionChange: (nodeIds: string[], edgeIds: string[]) => void;
  pendingNode: { item: NodeCatalogItem; position: { x: number; y: number } } | null;
  onPendingNodeConsumed: () => void;
  /** tldraw camera state — RF viewport syncs to this */
  tldrawCamera: { x: number; y: number; z: number } | null;
  /** Called when React Flow is initialized and nodes are in DOM */
  onReady?: () => void;
  edgeType: string;
  pathType: string;
  arrowType: string;
  color: string;
  onEdgeTypeChange: (v: string) => void;
  onPathTypeChange: (v: string) => void;
  onArrowTypeChange: (v: string) => void;
  onColorChange: (v: string) => void;
}

// ─── Inner Flow Canvas ───────────────────────────────────────────────────────

function FlowCanvas({
  diagramData,
  onDiagramChange,
  onSelectionChange,
  pendingNode,
  onPendingNodeConsumed,
  tldrawCamera,
  onReady,
  edgeType,
  pathType,
  arrowType,
  color,
  onEdgeTypeChange,
  onPathTypeChange,
  onArrowTypeChange,
  onColorChange,
}: DiagramEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(diagramData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(diagramData.edges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReturnType<typeof Object> | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Sync internal state when diagramData changes externally (e.g. delete from timeline)
  useEffect(() => {
    setNodes(diagramData.nodes as any);
  }, [diagramData.nodes, setNodes]);

  useEffect(() => {
    setEdges(diagramData.edges as any);
  }, [diagramData.edges, setEdges]);

  // ─── Handle external node drops from LessonCanvas ───────────────────────
  useEffect(() => {
    if (!pendingNode) return;
    const { item, position } = pendingNode;
    const isContent = item.type === 'content';
    const isNotes = item.type === 'notes';
    const newNode: Node = {
      id: getNodeId(),
      type: item.type,
      position,
      data: isContent
        ? {
            label: item.label,
            content: '',
            darkMode: true,
            transparent: item.label.includes('transparent'),
            w: 350,
            h: 200,
          }
        : isNotes
        ? {
            label: item.label,
            text: '',
            bgColor: '#1e293b',
            borderColor: '#334155',
            textColor: '#e2e8f0',
            w: 220,
            h: 120,
          }
        : { label: item.label, icon: item.icon, bg: item.bg, border: item.border, sub: item.sub },
    };
    setNodes(nds => [...nds, newNode]);
    onPendingNodeConsumed();
  }, [pendingNode, onPendingNodeConsumed, setNodes]);

  // ─── Sync RF viewport to tldraw camera ──────────────────────────────────
  const { setViewport } = useReactFlow();
  useEffect(() => {
    if (!tldrawCamera) return;
    setViewport({ x: tldrawCamera.x * tldrawCamera.z, y: tldrawCamera.y * tldrawCamera.z, zoom: tldrawCamera.z }, { duration: 0 });
  }, [tldrawCamera, setViewport]);

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  // ─── Undo / Redo ────────────────────────────────────────────────────────
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const futureRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const skipRef = useRef(false);
  const lastExplicitSaveRef = useRef(0);

  const saveSnapshot = useCallback(() => {
    historyRef.current = [...historyRef.current, { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    futureRef.current = [];
  }, [nodes, edges]);

  const explicitSave = useCallback(() => {
    lastExplicitSaveRef.current = Date.now();
    saveSnapshot();
  }, [saveSnapshot]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    futureRef.current = [...futureRef.current, { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    const prev = historyRef.current.pop()!;
    skipRef.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    historyRef.current = [...historyRef.current, { nodes: structuredClone(nodes), edges: structuredClone(edges) }];
    const next = futureRef.current.pop()!;
    skipRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [nodes, edges, setNodes, setEdges]);

  // ─── Propagate changes to parent ────────────────────────────────────────
  const propagateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (propagateTimeoutRef.current) clearTimeout(propagateTimeoutRef.current);
    propagateTimeoutRef.current = setTimeout(() => {
      onDiagramChange({
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        edgeType,
        pathType,
        arrowType,
        color,
      });
    }, 300);
    return () => {
      if (propagateTimeoutRef.current) clearTimeout(propagateTimeoutRef.current);
    };
  }, [nodes, edges, edgeType, pathType, arrowType, color, onDiagramChange]);

  // ─── Wrapped change handlers with undo snapshots ────────────────────────
  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    const hasRemove = changes.some((c: { type: string }) => c.type === 'remove');
    const recentExplicit = (Date.now() - lastExplicitSaveRef.current) < 500;
    if (hasRemove && !skipRef.current && !recentExplicit) saveSnapshot();
    skipRef.current = false;
    onNodesChange(changes);
  }, [onNodesChange, saveSnapshot]);

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    const hasRemove = changes.some((c: { type: string }) => c.type === 'remove');
    const recentExplicit = (Date.now() - lastExplicitSaveRef.current) < 500;
    if (hasRemove && !skipRef.current && !recentExplicit) saveSnapshot();
    skipRef.current = false;
    onEdgesChange(changes);
  }, [onEdgesChange, saveSnapshot]);

  // ─── Selection handler ──────────────────────────────────────────────────
  const handleSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const nIds = selNodes.map(n => n.id);
    const eIds = selEdges.map(e => e.id);
    setSelectedNodeIds(nIds);
    setSelectedEdgeIds(eIds);
    onSelectionChange(nIds, eIds);

    // Sync toolbar to selected edge
    if (selEdges.length === 1 && selNodes.length === 0) {
      const e = selEdges[0];
      onEdgeTypeChange(e.type || 'solid');
      onPathTypeChange((e.data?.pathType as string) || 'bezier');
      onColorChange((e.style?.stroke as string) || '#58a6ff');
      onArrowTypeChange(arrowTypeFromEdge(e));
    }
  }, [onSelectionChange, onEdgeTypeChange, onPathTypeChange, onColorChange, onArrowTypeChange]);

  // ─── Apply toolbar changes to selected edges ───────────────────────────
  useEffect(() => {
    if (selectedEdgeIds.length === 0) return;
    setEdges(eds => eds.map(e => {
      if (!selectedEdgeIds.includes(e.id)) return e;
      const markers = buildMarkers(arrowType, color);
      return {
        ...e,
        type: edgeType,
        data: { ...e.data, pathType },
        style: { ...e.style, stroke: color },
        ...(markers.markerEnd !== undefined ? { markerEnd: markers.markerEnd } : {}),
        ...(markers.markerStart !== undefined ? { markerStart: markers.markerStart } : {}),
        ...(!markers.markerEnd ? { markerEnd: undefined } : {}),
        ...(!markers.markerStart ? { markerStart: undefined } : {}),
      };
    }));
  }, [edgeType, pathType, arrowType, color, selectedEdgeIds, setEdges]);

  // ─── Build new edge on connect ──────────────────────────────────────────
  const onConnect = useCallback((connection: Connection) => {
    explicitSave();
    const style = { stroke: color, strokeWidth: 2 };
    const data = { pathType };
    const markers = buildMarkers(arrowType, color);
    const edgeId = `rf-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const edge = { ...connection, id: edgeId, type: edgeType, style, data, ...markers } as Edge;
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges, edgeType, pathType, arrowType, color, explicitSave]);

  // ─── Drag & drop from node catalog ─────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDraggingOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const item = JSON.parse(raw) as NodeCatalogItem;
      const rfInstance = reactFlowInstance as { screenToFlowPosition?: (pos: { x: number; y: number }) => { x: number; y: number } };
      const position = rfInstance?.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        : { x: e.clientX - 200, y: e.clientY - 100 };

      explicitSave();
      const isContent = item.type === 'content';
      const isNotes = item.type === 'notes';
      const newNode: Node = {
        id: getNodeId(),
        type: item.type,
        position,
        data: isContent
          ? {
              label: item.label,
              text: item.label === 'Text + Image' ? 'Double-click to edit' : 'Double-click to edit',
              mode: item.label === 'Text + Image' ? 'text-image' : 'text',
              bgColor: '#1e293b',
              borderColor: '#475569',
              textColor: '#e1e4e8',
              fontSize: 'md',
              bold: false,
              textAlign: 'center',
              visible: true,
              showBorder: true,
              borderRadius: 10,
              showShadow: true,
              w: 200,
              h: 80,
            }
          : isNotes
          ? {
              label: item.label,
              text: '',
              bgColor: '#1e293b',
              borderColor: '#334155',
              textColor: '#e2e8f0',
              w: 220,
              h: 120,
            }
          : { label: item.label, icon: item.icon, bg: item.bg, border: item.border, sub: item.sub },
      };
      setNodes(nds => [...nds, newNode]);
    } catch { /* invalid drag data */ }
  }, [reactFlowInstance, setNodes, explicitSave]);

  // ─── Keyboard: Copy / Paste / Undo / Redo ──────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

      if (isMod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((isMod && e.key === 'z' && e.shiftKey) || (isMod && e.key === 'y')) { e.preventDefault(); redo(); return; }

      if (isMod && e.key === 'c') {
        const selNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
        if (selNodes.length === 0) return;
        const selNodeIdSet = new Set(selectedNodeIds);
        const selEdges = edges.filter(ed => selNodeIdSet.has(ed.source) && selNodeIdSet.has(ed.target));
        clipboardRef.current = { nodes: selNodes, edges: selEdges };
      }

      if (isMod && e.key === 'v') {
        const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current;
        if (clipNodes.length === 0) return;
        e.preventDefault();
        explicitSave();

        const srcBB = boundingBox(clipNodes);
        let offsetX = srcBB.width + PASTE_GAP;
        let offsetY = 0;

        for (let attempt = 0; attempt < 10; attempt++) {
          const newBB = {
            minX: srcBB.minX + offsetX,
            minY: srcBB.minY + offsetY,
            maxX: srcBB.maxX + offsetX,
            maxY: srcBB.maxY + offsetY,
            width: srcBB.width,
            height: srcBB.height,
          };
          if (!wouldOverlap(nodes, newBB)) break;
          offsetX += srcBB.width + PASTE_GAP;
        }

        const idMap = new Map<string, string>();
        const newNodes = clipNodes.map(n => {
          const newId = getNodeId();
          idMap.set(n.id, newId);
          return { ...structuredClone(n), id: newId, position: { x: n.position.x + offsetX, y: n.position.y + offsetY }, selected: false };
        });

        const newEdges = clipEdges.map(ed => ({
          ...structuredClone(ed),
          id: `rf-e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: idMap.get(ed.source) || ed.source,
          target: idMap.get(ed.target) || ed.target,
          selected: false,
        }));

        setNodes(nds => [...nds, ...newNodes]);
        setEdges(eds => [...eds, ...newEdges]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, selectedNodeIds, undo, redo, explicitSave, setNodes, setEdges]);

  // ─── Flip direction ─────────────────────────────────────────────────────
  const flipSelectedEdges = useCallback(() => {
    if (selectedEdgeIds.length === 0) return;
    explicitSave();
    setEdges(eds => eds.map(e => {
      if (!selectedEdgeIds.includes(e.id)) return e;
      const flipped: Edge = {
        ...e,
        source: e.target,
        target: e.source,
        sourceHandle: e.targetHandle?.replace('-target', '-source').replace('-source', '-target') || e.targetHandle,
        targetHandle: e.sourceHandle?.replace('-source', '-target').replace('-target', '-source') || e.sourceHandle,
      };
      return flipped;
    }));
  }, [selectedEdgeIds, setEdges, explicitSave]);

  // Expose flip via a data attribute so the toolbar can trigger it
  const flipRef = useRef(flipSelectedEdges);
  flipRef.current = flipSelectedEdges;

  return (
    <div
      className={`rf-diagram-wrapper${isDraggingOver ? ' rf-drop-active' : ''}`}
      data-has-edge-selection={selectedEdgeIds.length > 0 ? 'true' : 'false'}
      ref={(el) => {
        if (el) (el as HTMLElement & { __flipEdges?: () => void }).__flipEdges = flipRef.current;
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        onInit={(instance) => { setReactFlowInstance(instance); onReady?.(); }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        preventScrolling={false}
      >
        <SelectionTracker onSelectionChange={handleSelectionChange} />
      </ReactFlow>
    </div>
  );
}

// ─── Wrapped with Provider ───────────────────────────────────────────────────

export default function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
