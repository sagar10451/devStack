/**
 * Diagram (React Flow) types and catalogs.
 * All IDs for RF nodes/edges are prefixed with "rf-" so they can coexist
 * with tldraw shape IDs in the animation step system.
 */

import type { Node, Edge } from '@xyflow/react';

// ─── Persisted diagram state ─────────────────────────────────────────────────

export interface DiagramData {
  nodes: Node[];
  edges: Edge[];
  /** Toolbar defaults for next connection */
  edgeType: string;
  pathType: string;
  arrowType: string;
  color: string;
}

export const EMPTY_DIAGRAM: DiagramData = {
  nodes: [],
  edges: [],
  edgeType: 'solid',
  pathType: 'bezier',
  arrowType: 'arrowclosed',
  color: '#2563eb',
};

// ─── Node catalog ────────────────────────────────────────────────────────────

export interface NodeCatalogItem {
  type: string;
  category: string;
  label: string;
  /** String key into iconRegistry, or an emoji fallback */
  icon: string;
  bg: string;
  border: string;
  sub: string;
}

export const NODE_CATALOG: NodeCatalogItem[] = [
  // ── AWS Compute ──
  { type: 'shape', category: 'Compute', label: 'EC2', icon: 'EC2', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Instance' },
  { type: 'shape', category: 'Compute', label: 'Lambda', icon: 'Lambda', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Serverless' },
  { type: 'shape', category: 'Compute', label: 'Fargate', icon: 'Fargate', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Containers' },
  { type: 'shape', category: 'Compute', label: 'Step Functions', icon: 'StepFunctions', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Workflow' },
  { type: 'shape', category: 'Compute', label: 'Bedrock', icon: 'Bedrock', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'AI/ML' },

  // ── AWS Storage & Databases ──
  { type: 'shape', category: 'Databases', label: 'S3', icon: 'S3', bg: 'linear-gradient(135deg, #1a2e1a, #1e3a20)', border: '#3f8624', sub: 'Object Storage' },
  { type: 'shape', category: 'Databases', label: 'DynamoDB', icon: 'DynamoDB', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#4053d6', sub: 'NoSQL' },
  { type: 'shape', category: 'Databases', label: 'RDS', icon: 'RDS', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#3b48cc', sub: 'Managed SQL' },
  { type: 'shape', category: 'Databases', label: 'ElastiCache', icon: 'ElastiCache', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#3b48cc', sub: 'In-Memory' },
  { type: 'shape', category: 'Databases', label: 'Redshift', icon: 'Redshift', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#3b48cc', sub: 'Data Warehouse' },
  { type: 'shape', category: 'Databases', label: 'Kinesis', icon: 'Kinesis', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'Streaming' },

  // ── AWS Networking ──
  { type: 'shape', category: 'Networking', label: 'API Gateway', icon: 'APIGateway', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'REST/HTTP' },
  { type: 'shape', category: 'Networking', label: 'CloudFront', icon: 'CloudFront', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'CDN' },
  { type: 'shape', category: 'Networking', label: 'Route 53', icon: 'Route53', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'DNS' },
  { type: 'shape', category: 'Networking', label: 'ELB', icon: 'ELB', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'Load Balancer' },
  { type: 'shape', category: 'Networking', label: 'VPC Lattice', icon: 'VPCLattice', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'Service Mesh' },

  // ── AWS Messaging ──
  { type: 'shape', category: 'Messaging', label: 'SQS', icon: 'SQS', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#d63aff', sub: 'Queue' },
  { type: 'shape', category: 'Messaging', label: 'SNS', icon: 'SNS', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#d63aff', sub: 'Pub/Sub' },

  // ── AWS Security ──
  { type: 'shape', category: 'Security', label: 'Cognito', icon: 'Cognito', bg: 'linear-gradient(135deg, #2a1a1e, #3a1e22)', border: '#dd344c', sub: 'Auth' },

  // ── AWS Categories (generic) ──
  { type: 'shape', category: 'Categories', label: 'Compute', icon: 'Compute', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Containers', icon: 'Containers', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Database', icon: 'Database', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#3b48cc', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Storage', icon: 'Storage', bg: 'linear-gradient(135deg, #1a2e1a, #1e3a20)', border: '#3f8624', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Serverless', icon: 'Serverless', bg: 'linear-gradient(135deg, #2e2a1a, #3a3420)', border: '#ff9900', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Networking', icon: 'Networking', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Security', icon: 'Security', bg: 'linear-gradient(135deg, #2a1a1e, #3a1e22)', border: '#dd344c', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Analytics', icon: 'Analytics', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#a166ff', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Integration', icon: 'Integration', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#d63aff', sub: 'Category' },
  { type: 'shape', category: 'Categories', label: 'Management', icon: 'Management', bg: 'linear-gradient(135deg, #2a1a1e, #3a1e22)', border: '#e7157b', sub: 'Category' },

  // ── General (no icon library needed) ──
  { type: 'shape', category: 'General', label: 'User', icon: '\uD83D\uDC64', bg: 'linear-gradient(135deg, #2d1a2e, #3a1e38)', border: '#d2a8ff', sub: 'Actor' },
  { type: 'shape', category: 'General', label: 'Service', icon: '\u2699\uFE0F', bg: 'linear-gradient(135deg, #2a1a1e, #3a1e22)', border: '#f97583', sub: 'Microservice' },
  { type: 'shape', category: 'General', label: 'Queue', icon: '\uD83D\uDCE8', bg: 'linear-gradient(135deg, #2a2233, #342840)', border: '#bc8cff', sub: 'Message Bus' },
  { type: 'shape', category: 'General', label: 'Cache', icon: '\uD83D\uDCBE', bg: 'linear-gradient(135deg, #33291a, #403320)', border: '#f0b72f', sub: 'In-Memory' },
  { type: 'shape', category: 'General', label: 'Firewall', icon: '\uD83D\uDEE1\uFE0F', bg: 'linear-gradient(135deg, #2e1a1a, #3a2020)', border: '#f97583', sub: 'Security' },
  { type: 'shape', category: 'General', label: 'Client', icon: '\uD83D\uDCBB', bg: 'linear-gradient(135deg, #1a2332, #1e2d40)', border: '#58a6ff', sub: 'Browser/App' },

  // ── Content Nodes (markdown-capable, connectable with lines) ──
  { type: 'content', category: 'Content', label: 'Markdown', icon: '\uD83D\uDCDD', bg: 'transparent', border: 'transparent', sub: 'Rich text node' },

  // ── Notes Nodes (simple text with customizable colors) ──
  { type: 'notes', category: 'Content', label: 'Notes', icon: '\uD83D\uDCCB', bg: '#1e293b', border: '#334155', sub: 'Text note' },
];

// ─── Edge catalogs ───────────────────────────────────────────────────────────

export interface EdgeCatalogItem {
  id: string;
  label: string;
  desc: string;
}

export const EDGE_CATALOG: EdgeCatalogItem[] = [
  { id: 'solid', label: 'Solid', desc: 'Clean line' },
  { id: 'marching', label: 'Marching', desc: 'Moving dashes' },
  { id: 'flow', label: 'Flow', desc: 'Current flow' },
  { id: 'pulse', label: 'Pulse', desc: 'Breathing glow' },
  { id: 'electric', label: 'Electric', desc: 'Crackling energy' },
  { id: 'packet', label: 'Packet', desc: 'Traveling dot' },
  { id: 'stream', label: 'Stream', desc: 'Data stream' },
  { id: 'dashdot', label: 'Dash-Dot', desc: 'Static pattern' },
];

export const EDGE_GROUPS = [
  { group: 'Static', items: EDGE_CATALOG.filter(e => ['solid', 'dashdot'].includes(e.id)) },
  { group: 'Animated', items: EDGE_CATALOG.filter(e => ['marching', 'flow', 'pulse', 'electric'].includes(e.id)) },
  { group: 'Particle', items: EDGE_CATALOG.filter(e => ['packet', 'stream'].includes(e.id)) },
];

export interface PathCatalogItem {
  id: string;
  label: string;
}

export const PATH_CATALOG: PathCatalogItem[] = [
  { id: 'bezier', label: 'Bezier' },
  { id: 'straight', label: 'Straight' },
  { id: 'step', label: 'Step' },
  { id: 'smoothstep', label: 'Smooth' },
];

export interface ArrowCatalogItem {
  id: string;
  label: string;
}

export const ARROW_CATALOG: ArrowCatalogItem[] = [
  { id: 'none', label: 'None' },
  { id: 'arrow', label: '\u2192 Arrow' },
  { id: 'arrowclosed', label: '\u25B6 Filled' },
  { id: 'both', label: '\u2194 Both' },
];

export interface ColorOption {
  id: string;
  label: string;
}

export const COLORS: ColorOption[] = [
  { id: '#2563eb', label: 'Blue' },
  { id: '#16a34a', label: 'Green' },
  { id: '#dc2626', label: 'Red' },
  { id: '#7c3aed', label: 'Purple' },
  { id: '#d97706', label: 'Amber' },
  { id: '#0891b2', label: 'Teal' },
  { id: '#be185d', label: 'Rose' },
  { id: '#4b5563', label: 'Gray' },
  { id: '#0f172a', label: 'Dark' },
];
