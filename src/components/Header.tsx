import { Link } from 'react-router-dom';
import { Search, BookOpen, Code2, Maximize, Info } from 'lucide-react';
import { usePortalSafe } from '../data/portalContext';
import { usePresentation } from '../data/presentationContext';
import { findNodeByPath } from '../data/contentTree';
import { useState } from 'react';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

function PresentationToolToggle() {
  const { presentationTool, setPresentationTool } = usePresentation();
  return (
    <button
      onClick={() => setPresentationTool(presentationTool === 'laser' ? 'pointer' : 'laser')}
      className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
        presentationTool === 'laser'
          ? 'bg-red-50 border-2 border-red-400 shadow-md shadow-red-200/50'
          : 'bg-gray-50 border-2 border-gray-300 hover:bg-gray-100'
      }`}
      title={presentationTool === 'laser' ? 'Switch to Pointer' : 'Activate Laser Pen'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={presentationTool === 'laser' ? 'text-red-600' : 'text-gray-500'}>
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" fill={presentationTool === 'laser' ? '#ef4444' : '#9ca3af'} stroke="none" />
      </svg>
    </button>
  );
}

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function Header({ searchQuery, onSearchChange }: HeaderProps) {
  const { togglePresentation, isPresenting } = usePresentation();
  const [showAbout, setShowAbout] = useState(false);
  const { site, slugs, content } = usePortalSafe();

  const isTopLevel = slugs.length === 0;

  // YouTube label based on depth
  let youtubeLabel = 'Go to YouTube Channel';
  if (slugs.length === 1) {
    youtubeLabel = 'Go to YouTube Playlist';
  } else if (slugs.length >= 2) {
    youtubeLabel = 'Watch this on YouTube';
  }

  // Resolve YouTube URL: walk from deepest node up to root, fall back to site config
  let youtubeUrl = site.youtubeUrl;
  if (slugs.length > 0) {
    for (let depth = slugs.length; depth >= 1; depth--) {
      const node = findNodeByPath(content, slugs.slice(0, depth));
      if (node?.youtubeUrl) {
        youtubeUrl = node.youtubeUrl;
        break;
      }
    }
  }

  // Hide header search on non-top-level pages (topic pages have their own search in the dark header)
  const showSearch = isTopLevel;

  return (
    <>
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b-2 border-indigo-200">
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link to={site.basePath || '/'} className="flex items-center gap-3 group">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
            <div className="relative">
              <BookOpen className="w-5 h-5 text-white" />
              <Code2 className="w-3 h-3 text-white absolute -bottom-1 -right-1" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              {site.brandName}<span className="text-blue-600">{site.brandAccent}</span>
            </h1>
            {site.brandSubtitle && (
              <p className="text-xs text-gray-500 -mt-0.5">{site.brandSubtitle}</p>
            )}
          </div>
        </Link>

        {/* Search + YouTube */}
        <div className="flex items-center gap-4">
          {/* Search — only on landing page */}
          {showSearch && (
            <div className="relative hidden sm:block">
              <div className="flex items-center bg-gray-50 border-2 border-indigo-300 rounded-xl px-4 py-2.5 w-64 lg:w-80 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  className="bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 w-full"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Fullscreen / Present button — localhost only, hidden when presenting */}
          {isLocalhost && !isPresenting && (
            <button
              onClick={togglePresentation}
              className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium border-2 border-indigo-300"
            >
              <Maximize className="w-4 h-4" />
              <span className="hidden lg:inline">Present</span>
            </button>
          )}

          {/* Presentation tool toggle — only visible in fullscreen */}
          {isPresenting && (
            <PresentationToolToggle />
          )}

          {/* About button — localhost only, hidden when presenting */}
          {isLocalhost && !isPresenting && (
            <button
              onClick={() => setShowAbout(true)}
              className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 px-3 py-2.5 rounded-xl transition-colors text-sm font-medium border-2 border-gray-300"
              title="How this works"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          {/* YouTube Button — hidden on localhost */}
          {!isLocalhost && (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium border-2 border-red-300"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span className="hidden lg:inline">{youtubeLabel}</span>
            </a>
          )}
        </div>
      </div>
    </header>

    {/* About Modal — rendered outside header to avoid stacking context issues */}
    {showAbout && (
      <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-12" onClick={() => setShowAbout(false)}>
        <div className="bg-white rounded-2xl max-w-xl w-full max-h-[70vh] overflow-y-auto p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">How This Works</h2>
            <button onClick={() => setShowAbout(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>
            <div className="space-y-4 text-sm text-gray-600">
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Two Portals</h3>
                <p><b>localhost:5173/devStack</b> — devStack by Sagar Kumar (IT/CS topics)</p>
                <p><b>localhost:5173/chapterBreakdown</b> — Chapter Breakdown by Sagar Kumar (School — Class 10, 12)</p>
                <p>Each portal has its own branding, watermark, and content tree.</p>
                <p>Navigate between them by changing the URL.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Content Source of Truth (JSON Files)</h3>
                <p><b>Think Loud:</b> src/data/think_loud.json</p>
                <p><b>Chapter Breakdown:</b> src/data/chapter_breakdown.json</p>
                <p>All topics, subtopics, hierarchy, icons, colors, status — everything comes from these two JSON files.</p>
                <p>Folder generation script also reads from these: <b>npm run generate-folders</b></p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Card Grid — Zoom Slider</h3>
                <p>Top-right slider on card pages: adjust 2–5 cards per row.</p>
                <p>Each page remembers its own zoom level in localStorage.</p>
                <p>Cards scale up (padding, icon, text) at fewer columns to look square-ish.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Count Label (Topics/Chapters/Modules/Subjects)</h3>
                <p>Click the count badge in the dark header (e.g. "5 Topics").</p>
                <p>Cycles: Topics → Chapters → Modules → Subjects → Topics.</p>
                <p>Each page saves its own label choice to localStorage.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Coming Soon / In Progress Ribbon</h3>
                <p>Add <b>"status": "coming-soon"</b> to any node in the JSON file.</p>
                <p>Shows diagonal "In Progress" ribbon + frosted glass overlay on the card.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Canvas (Localhost Only)</h3>
                <p>Click any leaf topic → opens the infinite canvas editor (tldraw).</p>
                <p><b>Locked</b> — view-only, navigate animation with ← → arrows.</p>
                <p><b>Unlocked</b> — full editing: add shapes, text, images, arrows.</p>
                <p>Deleting shapes auto-removes them from animation steps and sub-topics.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Animation Steps</h3>
                <p>Unlock → select shapes → open "Steps" panel → click Add.</p>
                <p>When locked, press → to reveal steps one by one, ← to hide.</p>
                <p>Canvas auto-pans to keep revealed objects visible.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Sub Topics (Progress Tracker)</h3>
                <p>Open "Sub Topics" panel → add labels → set step ranges.</p>
                <p>First sub-topic: editable "from" and "to". Others auto-cascade.</p>
                <p>When locked: floats on canvas (top-right), draggable, auto-scrolls.</p>
                <p>Turns green + ding sound on completion. Last one fires confetti from bottom.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Idle Animations (CSS)</h3>
                <p>Select a shape → animation bar above canvas appears.</p>
                <p>Options: Float, Shake, Pulse, Bounce, Breathe, Wiggle, Sway.</p>
                <p>Applied via CSS after the shape is revealed by animation step.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Keyboard Shortcuts</h3>
                <p><b>→ / ←</b> — Next / Previous animation step (when locked)</p>
                <p><b>Cmd+S</b> — Manual save to localStorage</p>
                <p><b>Cmd+Shift+L</b> — Hide/show Lock button (for clean presenting)</p>
                <p><b>Esc</b> — Exit fullscreen / presentation mode</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Export / Import (JSON Backup)</h3>
                <p>Unlock → ⬇ downloads full lesson as JSON (shapes, images, steps, sub-topics, idle animations).</p>
                <p>⬆ uploads a previously exported JSON to restore canvas exactly.</p>
                <p>Use as backup against cache clears. Images stored as base64 inside JSON.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Present Mode</h3>
                <p>Click "Present" button → fullscreen + lock button auto-hidden.</p>
                <p>Laser pointer: red dot cursor on canvas, click+drag to draw temporary red strokes that fade after 1.2s.</p>
                <p>Header stays visible for navigation. Present/About buttons hide. Esc to exit.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Production (Vercel Deploy)</h3>
                <p>Students see PDF notes rendered (placed in public/notes/ folders).</p>
                <p>Canvas/editing/present/slider/about features are localhost only.</p>
                <p>YouTube buttons visible on production only.</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Site Branding</h3>
                <p>Edit <b>src/data/siteConfig.ts</b> for brand names, subtitles, watermarks, YouTube URLs.</p>
                <p>Icons available: see src/components/TopicIcon.tsx (Lucide icon names).</p>
              </section>
              <section>
                <h3 className="font-semibold text-gray-800 mb-1">Auto-Save</h3>
                <p>Canvas auto-saves to localStorage every 1.5 seconds.</p>
                <p>Includes: all shapes, animation steps, sub-topics, idle configs, shape animations.</p>
                <p>For safety, also export JSON periodically.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
