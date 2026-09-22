/**
 * PublicMarkdownViewer — premium full-page markdown rendering for production.
 * 80% content, 20% sticky TOC sidebar with full tree lines.
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Highlight, themes } from 'prism-react-renderer';
import type { PublicCanvasData } from './types';

interface PublicMarkdownViewerProps {
  data: PublicCanvasData;
  title: string;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
}

function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
      headings.push({ id: slugify(text), text, level });
    }
  }
  return headings;
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
  const language = className?.replace('language-', '') || 'text';
  const code = String(children).replace(/\n$/, '');
  return (
    <Highlight theme={themes.oneDark} code={code} language={language}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre style={{ ...style, borderRadius: 10, padding: '16px 20px', fontSize: 13, lineHeight: 1.7, overflow: 'auto', margin: '1.2em 0' }}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              <span style={{ display: 'inline-block', width: 32, textAlign: 'right', paddingRight: 16, color: 'rgba(255,255,255,0.2)', userSelect: 'none', fontSize: 11 }}>{i + 1}</span>
              {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

function HeadingRenderer({ level, children }: { level: number; children: React.ReactNode }) {
  const text = String(children).replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
  const id = slugify(text);
  if (level === 1) return <h1 id={id}>{children}</h1>;
  if (level === 2) return <h2 id={id}>{children}</h2>;
  if (level === 3) return <h3 id={id}>{children}</h3>;
  return <h4 id={id}>{children}</h4>;
}

/**
 * For each heading, check which depth levels still have a sibling BELOW.
 * A sibling = another heading at the same level that appears before we go back to a shallower level.
 * We need to draw vertical lines for every depth that has more siblings coming.
 */
function getActiveLinesAtDepths(headings: TocItem[], idx: number, minLevel: number): Set<number> {
  const active = new Set<number>();
  const currentDepth = headings[idx].level - minLevel;

  // For each depth from 0 to currentDepth, look ahead to see if there's another heading at that depth
  for (let d = 0; d <= currentDepth; d++) {
    const targetLevel = minLevel + d;
    for (let j = idx + 1; j < headings.length; j++) {
      const jLevel = headings[j].level;
      if (jLevel < targetLevel) break; // went shallower than target — no sibling
      if (jLevel === targetLevel) { active.add(d); break; } // found sibling
    }
  }
  return active;
}

function TocSidebar({ headings, activeId, sidebarRef }: { headings: TocItem[]; activeId: string; sidebarRef: React.RefObject<HTMLElement | null> }) {
  const navRef = useRef<HTMLElement>(null);

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Auto-scroll sidebar to keep the active item visible
  useEffect(() => {
    if (!activeId || !sidebarRef.current) return;
    const activeBtn = sidebarRef.current.querySelector(`[data-toc-id="${activeId}"]`) as HTMLElement | null;
    if (!activeBtn) return;

    const container = sidebarRef.current;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const padding = 40;

    // If button is below the visible area
    if (btnRect.bottom > containerRect.bottom - padding) {
      container.scrollTop += btnRect.bottom - containerRect.bottom + padding;
    }
    // If button is above the visible area
    else if (btnRect.top < containerRect.top + padding) {
      container.scrollTop -= containerRect.top + padding - btnRect.top;
    }
  }, [activeId, sidebarRef]);

  if (headings.length === 0) return null;
  const minLevel = Math.min(...headings.map(h => h.level));

  return (
    <nav ref={navRef}>
      <div className="text-[9px] font-extrabold text-indigo-400 uppercase tracking-[0.15em] mb-4 px-1">
        On this page
      </div>
      <div className="relative">
        {headings.map((item, i) => {
          const depth = item.level - minLevel;
          const isActive = item.id === activeId;
          const activeLines = getActiveLinesAtDepths(headings, i, minLevel);
          const indentPx = 18;

          return (
            <div key={`${item.id}-${i}`} className="relative" style={{ paddingLeft: depth * indentPx }}>
              {/* Vertical lines for EVERY depth that has siblings below */}
              {Array.from({ length: depth }, (_, d) => {
                const shouldDraw = activeLines.has(d);
                // Also draw the line for the immediate parent connecting to this item
                const isParentLine = d === depth - 1;
                if (!shouldDraw && !isParentLine) return null;

                // For the last sibling at this depth, cut the line at 50%
                const isLastAtThisDepth = isParentLine && !activeLines.has(depth - 1);

                return (
                  <div
                    key={d}
                    className="absolute"
                    style={{
                      left: d * indentPx + 7,
                      top: 0,
                      bottom: isLastAtThisDepth ? '50%' : 0,
                      width: 1,
                      backgroundColor: '#2a2a4e',
                    }}
                  />
                );
              })}

              {/* Horizontal branch */}
              {depth > 0 && (
                <div
                  className="absolute"
                  style={{
                    left: (depth - 1) * indentPx + 7,
                    top: '50%',
                    width: indentPx - 7,
                    height: 1,
                    backgroundColor: '#cbd5e1',
                  }}
                />
              )}

              {/* Dot */}
              {depth > 0 && (
                <div
                  className="absolute rounded-full"
                  style={{
                    left: depth * indentPx - 1,
                    top: 'calc(50% - 3px)',
                    width: 6,
                    height: 6,
                    backgroundColor: isActive ? '#059669' : '#94a3b8',
                    boxShadow: isActive ? '0 0 6px rgba(5,150,105,0.4)' : 'none',
                    transition: 'all 0.2s',
                  }}
                />
              )}

              {/* Label */}
              <button
                onClick={() => handleClick(item.id)}
                data-toc-id={item.id}
                className={`block w-full text-left transition-all duration-200 rounded-md py-[5px] ${
                  isActive
                    ? 'text-emerald-400 font-semibold bg-emerald-500/10'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-[#12121f]'
                } ${depth === 0 ? 'font-semibold text-[12.5px] text-slate-300' : 'text-[11px]'}`}
                style={{ paddingLeft: depth > 0 ? 12 : 6 }}
              >
                {item.text}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export default function PublicMarkdownViewer({ data, title }: PublicMarkdownViewerProps) {
  const [activeId, setActiveId] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const headings = useMemo(() => extractHeadings(data.content || ''), [data.content]);

  // Track active heading via scroll position
  useEffect(() => {
    if (headings.length === 0) return;
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      let current = '';
      for (const heading of headings) {
        const el = document.getElementById(heading.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        // If heading is within the top 40% of the content area, it's active
        if (rect.top - containerRect.top < containerRect.height * 0.4) {
          current = heading.id;
        }
      }
      if (current) setActiveId(current);
    };

    // Initial check
    setTimeout(handleScroll, 500);
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [headings]);

  if (!data.content) {
    return (
      <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center">
        <p className="text-gray-400 text-lg">No content yet</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-78px)] bg-[#0d0d14] flex overflow-hidden">
      {/* Main content — own scroll container; full-width on mobile, 80% when sidebar visible */}
      <div ref={contentRef} className="overflow-y-auto h-full flex-1 lg:flex-none lg:basis-[80%]">
        <article className="px-4 sm:px-10 md:px-14 lg:px-20 py-6 sm:py-10 md:py-14">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-100 tracking-tight leading-tight mb-6 sm:mb-8 pb-4 sm:pb-6 border-b-2 border-[#1a1a2e]">
            {title}
          </h1>
          <div className="public-md-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              urlTransform={(url) => url}
              components={{
                code({ className, children, ...props }) {
                  const isBlock = className?.startsWith('language-');
                  if (isBlock) return <CodeBlock className={className}>{String(children)}</CodeBlock>;
                  return <code className="inline-code" {...props}>{children}</code>;
                },
                h1: ({ children }) => <HeadingRenderer level={1}>{children}</HeadingRenderer>,
                h2: ({ children }) => <HeadingRenderer level={2}>{children}</HeadingRenderer>,
                h3: ({ children }) => <HeadingRenderer level={3}>{children}</HeadingRenderer>,
                h4: ({ children }) => <HeadingRenderer level={4}>{children}</HeadingRenderer>,
                table: ({ children, ...props }) => (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table {...props}>{children}</table>
                  </div>
                ),
                img: ({ src, alt, width, ...props }) => {
                  const align = (props as any)['data-align'] || 'left';
                  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
                  return (
                    <div style={{ display: 'flex', justifyContent: justify }} className="my-4">
                      <img
                        src={src}
                        alt={alt || 'image'}
                        className="rounded-lg shadow-md"
                        style={{ width: width ? String(width) : '100%', maxWidth: '100%' }}
                        loading="lazy"
                      />
                    </div>
                  );
                },
              }}
            >
              {data.content}
            </ReactMarkdown>
          </div>
        </article>
      </div>

      {/* TOC Sidebar */}
      <aside
        ref={sidebarRef}
        className="hidden lg:block h-full overflow-y-auto"
        style={{
          flex: '0 0 20%',
          borderLeft: '2px solid #1a1a2e',
          background: '#0a0a14',
        }}
      >
        <div className="px-4 py-6">
          <div className="pb-2" />
          <TocSidebar headings={headings} activeId={activeId} sidebarRef={sidebarRef} />
          <div className="pt-6" />
        </div>
      </aside>
    </div>
  );
}
