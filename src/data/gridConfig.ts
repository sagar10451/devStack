/**
 * Grid column configuration per page path.
 * Set values on localhost via the zoom slider — they save here.
 * Production reads from this file (no slider visible).
 * 
 * Key: page path (e.g. 'root', '/java', '/java/introduction-to-java')
 * Value: number of columns (2-5)
 */

export const gridColumns: Record<string, number> = {
  'root': 5,
  '/devStack': 5,
  '/java': 5,
  '/devStack/java': 5,
};

/**
 * Get the column count for a page path.
 * Falls back to 5 if not configured.
 */
export function getGridColumns(path: string): number {
  return gridColumns[path] || 5;
}

/**
 * Count label configuration per page path.
 * Set values on localhost via clicking the label badge — they save here.
 * Production reads from this file (clicking disabled).
 *
 * Key: page path (e.g. 'root', '/java', '/java/introduction-to-java')
 * Value: label string ('Topics', 'Chapters', 'Modules', 'Subjects')
 */

export const countLabels: Record<string, string> = {
  'root': 'Topics',
  '/devStack': 'Topics',
  '/java': 'Topics',
  '/devStack/java': 'Modules',
};

/**
 * Get the count label for a page path.
 * Falls back to 'Topics' if not configured.
 */
export function getCountLabel(path: string): string {
  return countLabels[path] || 'Topics';
}
