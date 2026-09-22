/**
 * Generic content tree structure.
 * A node can either contain children (another level of cards)
 * or be a leaf (opens canvas lesson).
 */

export interface ContentNode {
  id: string;
  number: number;
  title: string;
  description: string;
  slug: string;
  icon: string;
  color: string;
  /** 'live' (default), 'coming-soon', 'done', or 'upcoming' — shows ribbon on card */
  status?: 'live' | 'coming-soon' | 'done' | 'upcoming';
  /** Optional YouTube URL for this level (channel, playlist, or video) */
  youtubeUrl?: string;
  /** Child nodes — if empty, this is a leaf (canvas lesson) */
  children: ContentNode[];
}

/**
 * Find a node by following a path of slugs.
 * e.g. ['social-science', 'history'] → finds the history node inside social-science
 */
export function findNodeByPath(tree: ContentNode[], slugPath: string[]): ContentNode | null {
  if (slugPath.length === 0) return null;

  const [currentSlug, ...rest] = slugPath;
  const node = tree.find(n => n.slug === currentSlug);
  if (!node) return null;

  if (rest.length === 0) return node;
  return findNodeByPath(node.children, rest);
}

/**
 * Check if a node is a leaf (has no children — opens canvas).
 */
export function isLeaf(node: ContentNode): boolean {
  return node.children.length === 0;
}
