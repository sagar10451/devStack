/**
 * Shared multi-line paste parsing logic.
 * Identical to the canvas paste handler in LessonCanvas.tsx.
 */

export interface ParsedLine {
  text: string;
  indent: number;
}

export function parseClipboardLines(
  plainText: string | undefined,
  html: string | undefined,
): ParsedLine[] | null {
  if (!plainText) return null;

  const lines = plainText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length <= 1) return null;

  // Skip tldraw internal data
  if (html && html.includes('data-tldraw')) return null;

  // Default: parse from plain text with indentation
  let finalLines: ParsedLine[] = lines.map(l => {
    const match = l.match(/^(\s*)/);
    const leadingSpaces = match ? match[1].length : 0;
    const tabCount = (match?.[1] || '').split('\t').length - 1;
    const spaceIndent = Math.floor((leadingSpaces - tabCount) / 2);
    const indent = tabCount + spaceIndent;
    return { text: l.trimEnd(), indent: Math.min(indent, 4) };
  });

  // If HTML has list items, extract with bullet prefixes and nesting
  if (html && (html.includes('<li') || html.includes('<ul') || html.includes('<ol'))) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const listItems = doc.querySelectorAll('li');

      if (listItems.length > 0) {
        const items: ParsedLine[] = [];
        const orderedCounters: Record<number, number> = {};

        listItems.forEach(li => {
          const ariaLevel = parseInt(li.getAttribute('aria-level') || '1', 10);
          const depth = ariaLevel - 1;

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
    } catch { /* fallback to plain text */ }
  }

  return finalLines;
}
