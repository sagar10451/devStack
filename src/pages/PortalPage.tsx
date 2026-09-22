import { Link } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Search, ZoomIn } from 'lucide-react';
import { usePortalSafe } from '../data/portalContext';
import { getGridColumns, getCountLabel } from '../data/gridConfig';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
import { findNodeByPath, isLeaf } from '../data/contentTree';
import type { ContentNode } from '../data/contentTree';
import TopicIcon from '../components/TopicIcon';
import LessonPage from './LessonPage';
import { usePresentation } from '../data/presentationContext';

const LABEL_OPTIONS = ['Topics', 'Chapters', 'Modules', 'Subjects'] as const;

interface PortalPageProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function PortalPage({ searchQuery, onSearchChange }: PortalPageProps) {
  const { site, content, slugs } = usePortalSafe();

  // If no slugs → landing page (show top-level cards)
  if (slugs.length === 0) {
    return <CardGrid key="root" nodes={content} searchQuery={searchQuery} onSearchChange={onSearchChange} basePath={site.basePath} breadcrumbs={[]} site={site} isTopLevel />;
  }

  // Find the node at the current path
  const currentNode = findNodeByPath(content, slugs);

  if (!currentNode) {
    return (
      <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-200">Page not found</h2>
        <p className="text-gray-500 mt-2">The page you're looking for doesn't exist.</p>
        <Link to={site.basePath || '/'} className="inline-block mt-4 text-blue-400 hover:text-blue-300 font-medium">
          ← Back to Home
        </Link>
      </main>
    );
  }

  // If it's a leaf node → show canvas lesson
  if (isLeaf(currentNode)) {
    // Build topic/subtopic info for the canvas
    const parentSlugs = slugs.slice(0, -1);
    const parentNode = parentSlugs.length > 0 ? findNodeByPath(content, parentSlugs) : null;
    return (
      <LessonPage
        topicSlug={parentSlugs.join('/')}
        subtopicSlug={currentNode.slug}
        topicTitle={parentNode?.title || site.brandName + ' ' + site.brandAccent}
        subtopicTitle={currentNode.title}
        basePath={`${site.basePath}/${parentSlugs.join('/')}`}
      />
    );
  }

  // Node has children → show card grid
  const breadcrumbs = slugs.map((slug, i) => {
    const node = findNodeByPath(content, slugs.slice(0, i + 1));
    return { slug, title: node?.title || slug, path: `${site.basePath}/${slugs.slice(0, i + 1).join('/')}` };
  });

  return (
    <CardGrid
      key={slugs.join('/')}
      nodes={currentNode.children}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      basePath={`${site.basePath}/${slugs.join('/')}`}
      breadcrumbs={breadcrumbs}
      site={site}
      parentNode={currentNode}
      isTopLevel={false}
    />
  );
}

interface CardGridProps {
  nodes: ContentNode[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  basePath: string;
  breadcrumbs: { slug: string; title: string; path: string }[];
  site: { basePath: string; brandName: string; brandAccent: string };
  parentNode?: ContentNode;
  isTopLevel?: boolean;
}

function CardGrid({ nodes, searchQuery, onSearchChange, basePath, breadcrumbs, site, parentNode, isTopLevel }: CardGridProps) {
  const storageKey = `grid-cols-${basePath || 'root'}`;
  const configPath = basePath || 'root';
  const [columns, setColumns] = useState(() => {
    if (isLocalhost) {
      const saved = localStorage.getItem(storageKey);
      return saved ? Number(saved) : getGridColumns(configPath);
    }
    return getGridColumns(configPath);
  });
  const { isPresenting } = usePresentation();

  const labelKey = `count-label-${basePath}`;
  const [countLabel, setCountLabel] = useState(() => {
    if (isLocalhost) {
      const saved = localStorage.getItem(labelKey);
      return saved || getCountLabel(configPath);
    }
    return getCountLabel(configPath);
  });

  const handleColumnsChange = (val: number) => {
    setColumns(val);
    localStorage.setItem(storageKey, String(val));
    // Save to gridConfig via Vite dev server
    fetch('/__save-grid-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: configPath, columns: val }),
    }).catch(() => { /* ignore on production */ });
  };

  const filtered = nodes.filter((node) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      node.title.toLowerCase().includes(q) ||
      (node.description || '').toLowerCase().includes(q)
    );
  });

  const gridColsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  }[columns] || 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  const cardPadding = {
    2: 'p-8',
    3: 'p-7',
    4: 'p-6',
    5: 'p-5',
  }[columns] || 'p-5';

  const iconSize = {
    2: 'w-16 h-16',
    3: 'w-14 h-14',
    4: 'w-13 h-13',
    5: 'w-12 h-12',
  }[columns] || 'w-12 h-12';

  const iconInnerSize = {
    2: 'w-8 h-8',
    3: 'w-7 h-7',
    4: 'w-7 h-7',
    5: 'w-6 h-6',
  }[columns] || 'w-6 h-6';

  const titleSize = {
    2: 'text-lg',
    3: 'text-base',
    4: 'text-sm',
    5: 'text-sm',
  }[columns] || 'text-sm';

  const descSize = {
    2: 'text-sm',
    3: 'text-xs',
    4: 'text-xs',
    5: 'text-xs',
  }[columns] || 'text-xs';

  return (
    <main className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-16">
      {/* Breadcrumb (not on top-level landing) */}
      {!isTopLevel && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
          <Link to={site.basePath || '/'} className="hover:text-blue-400 transition-colors">Home</Link>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.slug} className="flex items-center gap-2">
              <ChevronRight className="w-3 h-3" />
              {i === breadcrumbs.length - 1 ? (
                <span className="text-gray-200 font-medium">{crumb.title}</span>
              ) : (
                <Link to={crumb.path} className="hover:text-blue-400 transition-colors">{crumb.title}</Link>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Topic Header Card (when not top-level) */}
      {!isTopLevel && parentNode && (
        <div
          className="relative bg-gradient-to-r from-[#141428] to-[#0e0e1c] rounded-xl border border-[#2a2a4e] p-5 mb-6 overflow-hidden"
          style={{ borderLeftWidth: '3px', borderLeftColor: parentNode.color, boxShadow: `0 0 20px ${parentNode.color}10, 0 4px 20px rgba(0,0,0,0.3)` }}
        >
          {/* Top highlight */}
          <div className="absolute top-0 left-[10%] right-[60%] h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${parentNode.color}40, transparent)` }} />
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${parentNode.color}40, ${parentNode.color}15)`, boxShadow: `0 0 12px ${parentNode.color}25` }}
            >
              <TopicIcon icon={parentNode.icon} className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{parentNode.title}</h1>
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full select-none"
                  style={{ backgroundColor: `${parentNode.color}30`, color: parentNode.color, cursor: isLocalhost ? 'pointer' : 'default' }}
                  onClick={isLocalhost ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const current = countLabel;
                    const idx = LABEL_OPTIONS.indexOf(current as typeof LABEL_OPTIONS[number]);
                    const next = LABEL_OPTIONS[(idx + 1) % LABEL_OPTIONS.length];
                    localStorage.setItem(labelKey, next);
                    setCountLabel(next);
                    // Save to config file via Vite dev server
                    fetch('/__save-label-config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ path: configPath, label: next }),
                    }).catch(() => { /* ignore */ });
                  } : undefined}
                >
                  {nodes.length} {countLabel}
                </span>
              </div>
              <p className="text-slate-300 text-sm mt-0.5">{parentNode.description}</p>
            </div>

            {/* Search bar inside dark header */}
            <div className="hidden sm:flex items-center bg-[#12121f] border border-[#2a2a4e] rounded-lg px-3 py-2 w-56 focus-within:border-blue-500/40 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
              <Search className="w-3.5 h-3.5 text-slate-500 mr-2 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent outline-none text-sm text-white placeholder-slate-400 w-full"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Zoom slider — localhost only, hidden in presentation */}
      {isLocalhost && !isPresenting && (
        <div className="flex items-center justify-end mb-4 gap-3">
          <ZoomIn className="w-4 h-4 text-gray-500" />
          <input
            type="range"
            min={2}
            max={5}
            value={columns}
            onChange={(e) => handleColumnsChange(Number(e.target.value))}
            className="w-28 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0"
          />
          <span className="text-xs font-medium text-gray-500 w-4">{columns}</span>
        </div>
      )}

      {/* Card Grid */}
      <div className={`grid ${gridColsClass} gap-5`}>
        <AnimatePresence mode="popLayout">
          {filtered.map((node) => (
            <motion.div
              key={node.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
                layout: { type: 'spring', stiffness: 500, damping: 35 },
              }}
            >
            {(() => {
              const canEnter = isLocalhost || node.status === 'done' || !node.status || node.status === 'live';
              const CardWrapper = canEnter ? Link : 'div';
              const cardProps = canEnter ? { to: `${basePath}/${node.slug}` } : {};
              return (
            <CardWrapper
              {...cardProps as any}
              className={`group block relative rounded-2xl ${cardPadding} border transition-all duration-300 overflow-hidden ${!isTopLevel ? 'h-full' : ''} ${!canEnter ? 'cursor-not-allowed opacity-70' : ''}`}
              style={{
                background: 'linear-gradient(to bottom, #141428, #0e0e1c)',
                borderColor: `${node.color}15`,
                boxShadow: `0 0 0 1px ${node.color}08, 0 4px 16px rgba(0,0,0,0.25)`,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = `${node.color}45`;
                el.style.boxShadow = `0 0 16px ${node.color}18, 0 0 50px ${node.color}08, 0 8px 24px rgba(0,0,0,0.35)`;
                el.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = `${node.color}15`;
                el.style.boxShadow = `0 0 0 1px ${node.color}08, 0 4px 16px rgba(0,0,0,0.25)`;
                el.style.transform = 'translateY(0)';
              }}
            >
              {/* Top highlight line */}
              <div className="absolute top-0 left-[15%] right-[15%] h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${node.color}25, transparent)` }} />
              {/* Coming Soon ribbon + frosted glass */}
              {node.status === 'coming-soon' && (
                <>
                  <div className="ribbon-coming-soon">In Progress</div>
                  <div className="absolute bottom-0 left-0 right-0 h-[60px] backdrop-blur-[2px] bg-[#0a0a12]/80 z-[5] flex items-end justify-center pb-3">
                    <span className="text-xs font-semibold text-blue-400 tracking-wide uppercase">Coming Soon</span>
                  </div>
                </>
              )}
              {/* Done ribbon */}
              {node.status === 'done' && (
                <div className="ribbon-done">Done</div>
              )}
              {/* Upcoming ribbon */}
              {node.status === 'upcoming' && (
                <div className="ribbon-upcoming">Upcoming</div>
              )}

              {/* Number badge */}
              <div className="absolute top-1.5 right-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${node.color}25`,
                    color: node.color,
                  }}
                >
                  {node.number.toString().padStart(2, '0')}
                </span>
              </div>

              {/* Icon */}
              <div
                className={`${iconSize} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}
                style={{
                  background: `linear-gradient(135deg, ${node.color}25, ${node.color}08)`,
                  boxShadow: `0 0 12px ${node.color}15`,
                }}
              >
                <TopicIcon icon={node.icon} className={`${iconInnerSize} text-slate-300`} />
              </div>

              {/* Content */}
              <h3 className={`font-semibold text-gray-100 ${titleSize} mb-1`}>
                {node.title}
              </h3>
              <p className={`${descSize} text-gray-500 leading-relaxed line-clamp-2`}>
                {node.description}
              </p>

              {/* Bottom accent line */}
              <div
                className="absolute bottom-0 left-0 right-0 h-[2px] opacity-30 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, ${node.color}, transparent)`, boxShadow: `0 0 8px ${node.color}40` }}
              />
            </CardWrapper>
              );
            })()}
          </motion.div>
        ))}
        </AnimatePresence>
      </div>

    </main>
  );
}
