import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { isLeafNode } from '../utils/markdownTree';
import type { MarkdownTree, TreeNode } from '../utils/markdownTree';
import ContentRenderer from './ContentRenderer';
import LeafContentReveal from './LeafContentReveal';

interface ProgressiveDisclosureProps {
  tree: MarkdownTree;
}

export default function ProgressiveDisclosure({ tree }: ProgressiveDisclosureProps) {
  const [expandAll, setExpandAll] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isSectionExpanded = (id: string) => expandAll || expandedSections.has(id);

  return (
    <div>
      {/* Title + Expand All button */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-100">{tree.title}</h1>
          {/* Intro content */}
          {tree.introContent.length > 0 && (
            <div className="mt-3">
              {tree.introContent.map((block, i) => (
                <ContentRenderer key={i} block={block} />
              ))}
            </div>
          )}
        </div>

        {/* Expand All toggle */}
        <button
          onClick={() => setExpandAll(!expandAll)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-shrink-0 ml-4 ${
            expandAll
              ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
              : 'bg-[#12121f] text-slate-400 border border-[#2a2a4e] hover:border-blue-500/30 hover:text-blue-300'
          }`}
          title={expandAll ? 'Collapse to progressive mode' : 'Expand all sections'}
        >
          <Layers className="w-3.5 h-3.5" />
          {expandAll ? 'Collapse' : 'Expand All'}
        </button>
      </div>

      {/* Sections (h2 level) */}
      <div className="space-y-3">
        {tree.sections.map((section) => (
          <SectionCard
            key={section.id}
            node={section}
            isExpanded={isSectionExpanded(section.id)}
            onToggle={() => toggleSection(section.id)}
            expandAll={expandAll}
            expandedSections={expandedSections}
            onToggleChild={toggleSection}
          />
        ))}
      </div>
    </div>
  );
}

interface SectionCardProps {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  expandAll: boolean;
  expandedSections: Set<string>;
  onToggleChild: (id: string) => void;
}

function SectionCard({ node, isExpanded, onToggle, expandAll, expandedSections, onToggleChild }: SectionCardProps) {
  const hasChildren = node.children.length > 0;
  const hasContent = node.content.length > 0;
  const isLeaf = isLeafNode(node);

  return (
    <div className="rounded-xl border border-[#2a2a4e] bg-[#12121f] overflow-hidden shadow-sm hover:border-blue-500/30 hover:shadow-[0_0_8px_rgba(59,130,246,0.1)] transition-colors">
      {/* Section header — always clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#0d0d18] transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            isExpanded ? 'bg-blue-500/15' : 'bg-[#0d0d18] group-hover:bg-blue-500/10'
          }`}>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-blue-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
            )}
          </div>
          <h2 className={`font-semibold transition-colors ${
            isExpanded ? 'text-blue-300' : 'text-slate-200 group-hover:text-blue-300'
          }`}>
            {node.title}
          </h2>
        </div>

        {/* Indicator: how many children or content blocks */}
        <span className="text-xs text-slate-500">
          {hasChildren ? `${node.children.length} sub-topics` : hasContent ? `${node.content.length} points` : ''}
        </span>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-[#1a1a2e]">
              {/* If this section has direct content AND children, show content first */}
              {hasContent && hasChildren && (
                <div className="mt-3 mb-4 pl-2 border-l-2 border-blue-500/20">
                  <LeafContentReveal content={node.content} expandAll={expandAll} />
                </div>
              )}

              {/* If leaf node (no children), show content with point-by-point reveal */}
              {isLeaf && hasContent && (
                <div className="mt-3">
                  <LeafContentReveal content={node.content} expandAll={expandAll} />
                </div>
              )}

              {/* If has children, show them as nested cards */}
              {hasChildren && (
                <div className="mt-3 space-y-2">
                  {node.children.map((child) => {
                    const childExpanded = expandAll || expandedSections.has(child.id);
                    return (
                      <ChildSectionCard
                        key={child.id}
                        node={child}
                        isExpanded={childExpanded}
                        onToggle={() => onToggleChild(child.id)}
                        expandAll={expandAll}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChildSectionCardProps {
  node: TreeNode;
  isExpanded: boolean;
  onToggle: () => void;
  expandAll: boolean;
}

function ChildSectionCard({ node, isExpanded, onToggle, expandAll }: ChildSectionCardProps) {
  const hasContent = node.content.length > 0;

  return (
    <div className="rounded-lg border border-[#2a2a4e] bg-[#0d0d18] overflow-hidden hover:border-blue-500/30 transition-colors">
      {/* Child header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#12121f] transition-colors group"
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
            isExpanded ? 'bg-blue-500/15' : 'bg-[#12121f] group-hover:bg-blue-500/10'
          }`}>
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-blue-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
            )}
          </div>
          <h3 className={`text-sm font-medium transition-colors ${
            isExpanded ? 'text-blue-300' : 'text-slate-300 group-hover:text-blue-300'
          }`}>
            {node.title}
          </h3>
        </div>
        {hasContent && (
          <span className="text-xs text-gray-400">{node.content.length} points</span>
        )}
      </button>

      {/* Child expanded content */}
      <AnimatePresence>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-[#1a1a2e]">
              <LeafContentReveal content={node.content} expandAll={expandAll} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
