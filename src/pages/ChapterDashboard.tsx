/**
 * ChapterDashboard — Premium dark navy educational dashboard.
 * Deep navy background, electric blue accents, alternating table rows,
 * blue identity for first book, purple for second, per spec.
 */

import { Link } from 'react-router-dom';
import { ChevronRight, ChevronUp, FileText } from 'lucide-react';
import { useState } from 'react';
import type { ContentNode } from '../data/contentTree';
import TopicIcon from '../components/TopicIcon';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

/* ─── Class Visibility Flags ─────────────────────────────────────────────── */
const CLASS_FLAGS: Record<string, boolean> = {
  'Class 10': true,
  'Class 12': false,
};

/* ─── Color System ────────────────────────────────────────────────────────── */
const C = {
  page:        '#050A16',
  surface:     '#081321',
  surfaceAlt:  '#0D182A',
  header:      '#0D1930',
  borderSub:   'rgba(100,116,139,0.18)',
  textPri:     '#F8FAFC',
  textSec:     '#A8B3C7',
  textMuted:   '#718096',
  blue:        '#2563EB',
  blueLight:   '#3B82F6',
  cyan:        '#0EA5E9',
  purple:      '#7C3AED',
  purpleLight: '#A855F7',
  green:       '#10B981',
  red:         '#EF233C',
};

/* Book accent configs — blue for odd books, purple for even */
const BOOK_ACCENTS = [
  { // Blue identity
    border: '#087CFF',
    glow: '0 0 25px rgba(37,99,235,0.08)',
    headerBg: 'linear-gradient(90deg, #071326 0%, #0B2550 55%, #063B6E 100%)',
    badgeBg: 'linear-gradient(135deg, #2563EB, #0284C7)',
    collapseBg: 'rgba(37,99,235,0.12)',
    collapseBorder: 'rgba(59,130,246,0.5)',
    accentColor: '#60A5FA',
  },
  { // Purple identity
    border: '#A855F7',
    glow: '0 0 25px rgba(168,85,247,0.08)',
    headerBg: 'linear-gradient(90deg, #160B2C, #32105C, #45115E)',
    badgeBg: 'linear-gradient(135deg, #7C3AED, #A855F7)',
    collapseBg: 'rgba(124,58,237,0.12)',
    collapseBorder: 'rgba(168,85,247,0.5)',
    accentColor: '#C4B5FD',
  },
];

const SUBJECT_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  English:          { bg: 'linear-gradient(90deg, #C026D3, #7C3AED, #2563EB)', text: '#fff', icon: 'BookOpen' },
  Mathematics:      { bg: '#d97706', text: '#fff', icon: 'Calculator' },
  Science:          { bg: '#059669', text: '#fff', icon: 'Beaker' },
  'Social Science': { bg: 'transparent', text: '#CBD5E1', icon: 'Globe' },
  Physics:          { bg: '#0891b2', text: '#fff', icon: 'Atom' },
  Chemistry:        { bg: '#d97706', text: '#fff', icon: 'Beaker' },
  Biology:          { bg: '#059669', text: '#fff', icon: 'Leaf' },
};

const CLASS_CONFIGS: Record<string, { tagline: string; number: string }> = {
  'Class 09': { tagline: 'Build Strong Foundations', number: '09' },
  'Class 10': { tagline: 'Prepare Smart, Score Higher', number: '10' },
  'Class 12': { tagline: 'Your Final Step to Success', number: '12' },
};

interface ChapterDashboardProps {
  classes: ContentNode[];
  basePath: string;
  searchQuery: string;
}

export default function ChapterDashboard({ classes, basePath, searchQuery }: ChapterDashboardProps) {
  const query = (searchQuery || '').toLowerCase().trim();
  const visibleClasses = classes.filter(cls => CLASS_FLAGS[cls.title] !== false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeSubject, setActiveSubject] = useState<Record<string, string>>({});

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const matchesQuery = (node: ContentNode): boolean => {
    if (!query) return true;
    if (node.title.toLowerCase().includes(query)) return true;
    if (node.children.some(c => matchesQuery(c))) return true;
    return false;
  };

  return (
    <div
      className="w-full min-h-screen"
      style={{
        background: `radial-gradient(circle at 50% 0%, rgba(37,99,235,0.10), transparent 35%), ${C.page}`,
      }}
    >
      <div className="max-w-[1500px] mx-auto px-10 py-5 space-y-[16px]">
        {visibleClasses.map(cls => {
          const config = CLASS_CONFIGS[cls.title] || { tagline: '', number: cls.title.replace('Class ', '') };
          const subjects = cls.children.filter(s => matchesQuery(s));
          if (subjects.length === 0) return null;
          const activeSubj = activeSubject[cls.id] || subjects[0]?.id;

          // Flatten all books from the active subject
          const currentSubject = subjects.find(s => s.id === activeSubj) || subjects[0];
          const books = currentSubject ? currentSubject.children.filter(b => matchesQuery(b)) : [];

          return (
            <section key={cls.id} className="space-y-[16px]">
              {/* ═══ CLASS HERO BANNER ═══════════════════════════════ */}
              <div
                className="relative rounded-[14px] px-6 overflow-hidden"
                style={{
                  background: 'linear-gradient(120deg, #071126 0%, #0B1B3D 45%, #111744 70%, #071326 100%)',
                  border: '1px solid rgba(37,99,235,0.18)',
                  boxShadow: '0 0 25px rgba(37,99,235,0.08)',
                  height: 82,
                }}
              >
                {/* Decorative wave */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute -bottom-8 -right-12 w-[350px] h-[120px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(ellipse, #2563EB, transparent)' }} />
                  <div className="absolute -top-4 left-1/3 w-[200px] h-[80px] rounded-full opacity-[0.04]" style={{ background: 'radial-gradient(ellipse, #7C3AED, transparent)' }} />
                </div>

                <div className="relative flex items-center gap-5 h-full">
                  {/* Number badge */}
                  <div
                    className="w-[60px] h-[60px] rounded-[14px] flex items-center justify-center flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, #2563EB, #7C3AED, #D946EF)',
                      boxShadow: '0 0 20px rgba(99,102,241,0.3)',
                    }}
                  >
                    <span className="text-[28px] font-black text-white leading-none">{config.number}</span>
                  </div>

                  <div>
                    <h2 className="text-[22px] font-bold text-white leading-tight">{cls.title}</h2>
                    <p className="text-[13px]" style={{ color: C.textSec }}>{config.tagline}</p>
                  </div>

                  {/* Subject switcher */}
                  <div className="ml-auto flex items-center rounded-full" style={{ background: 'rgba(5,10,22,0.6)', border: '1px solid #253453', padding: '3px' }}>
                    {subjects.map((s, _si) => {
                      const isActive = s.id === activeSubj;
                      const st = SUBJECT_STYLES[s.title] || { bg: '#3b82f6', text: '#fff', icon: 'BookOpen' };
                      return (
                        <button
                          key={s.id}
                          onClick={() => setActiveSubject(prev => ({ ...prev, [cls.id]: s.id }))}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200"
                          style={{
                            background: isActive ? st.bg : 'transparent',
                            color: isActive ? st.text : '#94A3B8',
                          }}
                        >
                          <TopicIcon icon={s.icon} className="w-3.5 h-3.5 text-current" />
                          {s.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ═══ BOOK CARDS ══════════════════════════════════════ */}
              {books.map((book, bookIdx) => {
                const chapters = book.children.filter(c => matchesQuery(c));
                if (chapters.length === 0) return null;
                const bookId = `${cls.id}-${currentSubject.id}-${book.id}`;
                const isCollapsed = collapsed.has(bookId);
                const bookNum = String(bookIdx + 1).padStart(2, '0');
                const accent = BOOK_ACCENTS[bookIdx % BOOK_ACCENTS.length];

                return (
                  <div
                    key={bookId}
                    className="rounded-[14px] overflow-hidden"
                    style={{
                      background: '#07111F',
                      border: `1px solid ${accent.border}`,
                      boxShadow: accent.glow,
                    }}
                  >
                    {/* ─── Book Header ─────────────────────────────── */}
                    <div
                      className="flex items-center gap-3 px-5 cursor-pointer select-none"
                      style={{
                        background: accent.headerBg,
                        height: 66,
                        borderBottom: isCollapsed ? 'none' : `1px solid ${accent.border}30`,
                      }}
                      onClick={() => toggleCollapse(bookId)}
                    >
                      {/* Book number badge */}
                      <div
                        className="w-[50px] h-[44px] rounded-[9px] flex items-center justify-center flex-shrink-0"
                        style={{ background: accent.badgeBg }}
                      >
                        <span className="text-[16px] font-black text-white">{bookNum}</span>
                      </div>

                      <h3 className="text-[17px] font-bold text-white uppercase tracking-wider">{book.title}</h3>

                      <span
                        className="text-[11px] font-medium px-3 py-1 rounded-full ml-2"
                        style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.20)', color: '#CBD5E1' }}
                      >
                        {chapters.length} chapters
                      </span>

                      <div className="flex-1" />

                      {/* YouTube Playlist — production only, right-aligned */}
                      {!isLocalhost && (
                        <a
                          href={(book as any).youtubeUrl || 'https://youtube.com/@devStackBySagarKumar'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-2 px-5 py-[9px] rounded-[9px] text-[13px] font-bold transition-all duration-150 hover:shadow-[0_0_14px_rgba(239,35,60,0.3)] mr-3"
                          style={{
                            background: 'rgba(220,38,38,0.15)',
                            border: '1.2px solid #FF5A67',
                            color: '#FF5A67',
                          }}
                          onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = '#DC2626'; el.style.color = '#fff'; }}
                          onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(220,38,38,0.15)'; el.style.color = '#FF5A67'; }}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                          Go to Youtube Playlist (2026-27)
                        </a>
                      )}

                      {/* Collapse button */}
                      <div
                        className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center transition-colors flex-shrink-0"
                        style={{ background: accent.collapseBg, border: `1px solid ${accent.collapseBorder}` }}
                      >
                        <ChevronUp
                          className="w-4 h-4 transition-transform duration-200"
                          style={{ color: accent.accentColor, transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0)' }}
                        />
                      </div>
                    </div>

                    {/* ─── Table ───────────────────────────────────── */}
                    {!isCollapsed && (
                      <table className="w-full border-collapse">
                        <colgroup>
                          <col style={{ width: 56 }} />
                          <col />
                          {!isLocalhost && <col style={{ width: 175 }} />}
                          {!isLocalhost && <col style={{ width: 175 }} />}
                          {isLocalhost && <col style={{ width: 80 }} />}
                          {isLocalhost && <col style={{ width: 40 }} />}
                        </colgroup>
                        <thead>
                          <tr style={{ background: C.header }}>
                            <th className="text-[10px] font-bold uppercase tracking-wider text-center py-2.5 px-3" style={{ color: '#AAB7CF' }}>#</th>
                            <th className="text-[10px] font-bold uppercase tracking-wider text-left py-2.5 px-3" style={{ color: '#AAB7CF' }}>Chapter</th>
                            {!isLocalhost && (
                              <th className="text-center py-2.5 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#60A5FA' }}>
                                  <FileText className="w-3 h-3" /> Notes
                                </span>
                              </th>
                            )}
                            {!isLocalhost && (
                              <th className="text-center py-2.5 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#FF5A67' }}>
                                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                  YouTube Link
                                </span>
                              </th>
                            )}
                            {isLocalhost && (
                            <th className="text-center py-2.5 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#34D399' }}>
                                ✓ Status
                              </span>
                            </th>
                            )}
                            {isLocalhost && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {chapters.map((chapter, ci) => {
                            const chapterPath = `${basePath}/${cls.slug}/${currentSubject.slug}/${book.slug}/${chapter.slug}`;
                            const isDone = chapter.status === 'done';
                            const rowBg = ci % 2 === 0 ? '#07111F' : '#0D182A';
                            const hoverBg = '#12223A';

                            return (
                              <tr
                                key={chapter.id}
                                className="group transition-all duration-150"
                                style={{ background: isDone ? 'linear-gradient(90deg, rgba(37,99,235,0.15), rgba(37,99,235,0.04))' : rowBg, height: 44 }}
                                onMouseEnter={(e) => { if (!isDone) (e.currentTarget as HTMLElement).style.background = hoverBg; }}
                                onMouseLeave={(e) => { if (!isDone) (e.currentTarget as HTMLElement).style.background = rowBg; }}
                              >
                                {/* Number pill */}
                                <td className="text-center py-0 px-3">
                                  <span
                                    className="inline-block text-[11px] font-bold px-[10px] py-[3px] rounded-[7px]"
                                    style={{ background: '#111E35', color: isDone ? '#60A5FA' : '#DCE7F8' }}
                                  >
                                    {String(ci + 1).padStart(2, '0')}
                                  </span>
                                </td>

                                {/* Title */}
                                <td className="py-0 px-3">
                                  <Link
                                    to={chapterPath}
                                    className="text-[13px] font-medium transition-colors duration-150 hover:text-white"
                                    style={{ color: isDone ? C.textPri : '#F1F5F9' }}
                                  >
                                    {chapter.title}
                                  </Link>
                                </td>

                                {/* Notes button */}
                                {!isLocalhost && (
                                <td className="text-center py-0 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                                  <Link
                                    to={chapterPath}
                                    className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[7px] text-[10px] font-semibold transition-all duration-150 hover:shadow-[0_0_12px_rgba(37,99,235,0.25)]"
                                    style={{
                                      background: 'linear-gradient(180deg, rgba(37,99,235,0.25), rgba(37,99,235,0.12))',
                                      border: '1px solid #2563EB',
                                      color: '#E6F0FF',
                                    }}
                                    onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = '#1D4ED8'; el.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'linear-gradient(180deg, rgba(37,99,235,0.25), rgba(37,99,235,0.12))'; el.style.color = '#E6F0FF'; }}
                                  >
                                    <FileText className="w-3 h-3" />
                                    Click to get Notes
                                  </Link>
                                </td>
                                )}

                                {/* YouTube */}
                                {!isLocalhost && (
                                <td className="text-center py-0 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                                    <a
                                      href={(chapter as any).youtubeUrl || 'https://youtube.com/@devStackBySagarKumar'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 px-3 py-[6px] rounded-[7px] text-[10px] font-semibold transition-all duration-150 hover:shadow-[0_0_12px_rgba(239,35,60,0.25)]"
                                      style={{
                                        background: 'rgba(220,38,38,0.12)',
                                        border: `1px solid ${C.red}`,
                                        color: '#FF5A67',
                                      }}
                                      onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = '#DC2626'; el.style.color = '#fff'; }}
                                      onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(220,38,38,0.12)'; el.style.color = '#FF5A67'; }}
                                    >
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                      Watch on YouTube
                                    </a>
                                </td>
                                )}

                                {/* Status — localhost only */}
                                {isLocalhost && (
                                <td className="text-center py-0 px-2" style={{ borderLeft: `1px solid ${C.borderSub}` }}>
                                  {isDone ? (
                                    <div
                                      className="inline-flex w-[22px] h-[22px] rounded-full items-center justify-center"
                                      style={{ background: C.green, boxShadow: '0 0 10px rgba(16,185,129,0.25)' }}
                                    >
                                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M2.5 6l2.5 2.5L9.5 4" />
                                      </svg>
                                    </div>
                                  ) : (
                                    <div className="inline-block w-[22px] h-[22px] rounded-full" style={{ border: '2px solid #7C8AA5' }} />
                                  )}
                                </td>
                                )}

                                {/* Arrow — localhost only */}
                                {isLocalhost && (
                                <td className="text-center py-0">
                                  <Link to={chapterPath} className="inline-flex items-center justify-center w-full h-full">
                                    <ChevronRight className="w-4 h-4 transition-colors duration-150" style={{ color: '#94A3B8' }}
                                      onMouseEnter={(e) => { (e.currentTarget as SVGElement).style.color = '#fff'; }}
                                      onMouseLeave={(e) => { (e.currentTarget as SVGElement).style.color = '#94A3B8'; }}
                                    />
                                  </Link>
                                </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
