/**
 * ChapterDashboard — full overview landing page for ChapterBreakdown portal.
 * Shows all classes as rows, each with subject columns listing books/chapters.
 * Replaces the CardGrid for the top-level ChapterBreakdown page.
 */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ContentNode } from '../data/contentTree';
import TopicIcon from '../components/TopicIcon';

// Subject accent colors matching the reference image
const SUBJECT_COLORS: Record<string, string> = {
  English: '#6366f1',
  Mathematics: '#f59e0b',
  Science: '#10b981',
  'Social Science': '#ef4444',
  Physics: '#06b6d4',
  Chemistry: '#f59e0b',
  Biology: '#10b981',
};

// Class card configs
const CLASS_CONFIGS: Record<string, { gradient: string; tagline: string; number: string }> = {
  'Class 09': { gradient: 'from-blue-600 to-indigo-700', tagline: 'Build strong foundations', number: '09' },
  'Class 10': { gradient: 'from-emerald-600 to-teal-700', tagline: 'Prepare Smart, Score Higher', number: '10' },
  'Class 12': { gradient: 'from-purple-600 to-pink-700', tagline: 'Your Final Step to Success', number: '12' },
};

function getSubjectColor(title: string): string {
  return SUBJECT_COLORS[title] || '#3b82f6';
}

interface ChapterDashboardProps {
  classes: ContentNode[];
  basePath: string;
  searchQuery: string;
}

export default function ChapterDashboard({ classes, basePath, searchQuery }: ChapterDashboardProps) {
  // Filter by search
  const filteredClasses = searchQuery.trim()
    ? classes.filter(cls =>
        cls.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cls.children.some(subj =>
          subj.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          subj.children.some(book =>
            book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            book.children.some(ch => ch.title.toLowerCase().includes(searchQuery.toLowerCase()))
          )
        )
      )
    : classes;

  return (
    <div className="w-full">
      {/* ─── Class Rows ────────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-6">
        {filteredClasses.map(cls => {
          const config = CLASS_CONFIGS[cls.title] || { gradient: 'from-blue-600 to-indigo-700', tagline: '', number: cls.title.replace('Class ', '') };
          const subjects = cls.children;

          return (
            <div key={cls.id} className="flex gap-4 items-stretch">
              {/* Class Card */}
              <div className={`flex-shrink-0 w-[130px] rounded-2xl bg-gradient-to-br ${config.gradient} p-4 flex flex-col justify-between relative overflow-hidden`}>
                {/* Decorative circle */}
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/8" />
                <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-white/8" />
                <div className="relative z-10">
                  <span className="text-[10px] text-white/60 uppercase tracking-wider font-medium">Class</span>
                  <div className="text-5xl font-extrabold text-white leading-none mt-1">{config.number}</div>
                </div>
                <p className="text-[9px] text-white/70 mt-3 leading-snug relative z-10">{config.tagline}</p>
              </div>

              {/* Subject Columns */}
              <div className="flex-1 flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {subjects.map(subject => {
                  const subjectColor = getSubjectColor(subject.title);
                  const books = subject.children;

                  return (
                    <div
                      key={subject.id}
                      className="flex-1 min-w-[200px] rounded-2xl border overflow-hidden flex flex-col"
                      style={{
                        borderColor: `${subjectColor}40`,
                        background: 'linear-gradient(to bottom, #1a1a30, #131325)',
                        boxShadow: `0 0 0 1px ${subjectColor}10, 0 2px 12px rgba(0,0,0,0.3)`,
                      }}
                    >
                      {/* Subject Header */}
                      <div className="flex items-center gap-2.5 px-4 py-3 border-b" style={{ borderColor: `${subjectColor}25`, background: `${subjectColor}08` }}>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${subjectColor}25`, boxShadow: `0 0 8px ${subjectColor}15` }}
                        >
                          <TopicIcon icon={subject.icon} className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold" style={{ color: subjectColor }}>{subject.title}</h3>
                      </div>

                      {/* Books/Categories */}
                      <div className="flex-1 px-3 py-2 space-y-0.5">
                        {books.map(book => {
                          const chapterCount = book.children.length;
                          const bookPath = `${basePath}/${cls.slug}/${subject.slug}/${book.slug}`;

                          return (
                            <Link
                              key={book.id}
                              to={bookPath}
                              className="group flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all"
                            >
                              <span className="text-[12px] text-slate-200 group-hover:text-white transition-colors truncate flex-1 mr-2">
                                {book.title}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                  {chapterCount} Chapters
                                </span>
                                <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
