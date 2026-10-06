import { useState, useEffect } from 'react';
import { usePortalSafe } from '../data/portalContext';
import LessonCanvas from '../canvas/LessonCanvas';
import PublicMarkdownViewer from '../canvas/PublicMarkdownViewer';
import type { LessonCanvasData, PublicCanvasData } from '../canvas/types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LessonPageProps {
  topicSlug: string;
  subtopicSlug: string;
  topicTitle: string;
  subtopicTitle: string;
  basePath: string;
  driveFileId?: string;
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export default function LessonPage({ topicSlug, subtopicSlug, topicTitle, subtopicTitle, basePath, driveFileId }: LessonPageProps) {
  const { site } = usePortalSafe();
  const [canvasData, setCanvasData] = useState<LessonCanvasData | null>(null);
  const [publicData, setPublicData] = useState<PublicCanvasData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [publicLoadFailed, setPublicLoadFailed] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    if (isLocalhost) {
      fetch(`/__load-canvas?siteId=${encodeURIComponent(site.id)}&topicSlug=${encodeURIComponent(topicSlug)}&subtopicSlug=${encodeURIComponent(subtopicSlug)}`)
        .then(res => res.json())
        .then((data) => {
          if (data && data.version) setCanvasData(data as LessonCanvasData);
          setLoaded(true);
        })
        .catch(() => {
          setLoaded(true);
        });
    } else {
      // Production: if driveFileId exists, skip fetching markdown
      if (driveFileId) {
        setLoaded(true);
        return;
      }
      const jsonPath = `/notes/${site.id}/${topicSlug}/${subtopicSlug}/public-canvas.json`;
      fetch(jsonPath)
        .then(res => {
          if (!res.ok) throw new Error('Not found');
          return res.json();
        })
        .then((data: PublicCanvasData) => {
          setPublicData(data);
          setLoaded(true);
        })
        .catch(() => {
          setPublicLoadFailed(true);
          setLoaded(true);
        });
    }
  }, [site.id, topicSlug, subtopicSlug, driveFileId]);

  if (!loaded) {
    return (
      <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Production: show PDF viewer or markdown viewer
  if (!isLocalhost) {
    // PDF from Google Drive — full screen
    if (driveFileId) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#0B0D0F' }}>
          {/* Minimal floating back button */}
          <Link
            to={basePath}
            className="fixed top-4 left-4 z-[10000] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition-all"
            style={{ background: 'rgba(11,13,15,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>

          {/* Loading spinner */}
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-500 text-sm">Loading notes...</span>
              </div>
            </div>
          )}

          {/* PDF iframe — full viewport */}
          <iframe
            src={`https://drive.google.com/file/d/${driveFileId}/preview`}
            className="w-full h-full border-0"
            allow="autoplay"
            onLoad={() => setIframeLoaded(true)}
            style={{ opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
          />
        </div>
      );
    }

    // Markdown viewer
    if (publicData) {
      return <PublicMarkdownViewer data={publicData} title={subtopicTitle} />;
    }
    if (publicLoadFailed) {
      return (
        <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center bg-[#0a0a14]">
          <div className="text-center">
            <p className="text-slate-400 text-lg font-medium">Notes coming soon</p>
            <p className="text-gray-400 text-sm mt-1">{topicTitle} / {subtopicTitle}</p>
          </div>
        </div>
      );
    }
    return null;
  }

  // Localhost: show full canvas editor
  return (
    <LessonCanvas
      topicSlug={topicSlug}
      subtopicSlug={subtopicSlug}
      topicTitle={topicTitle}
      subtopicTitle={subtopicTitle}
      initialData={canvasData}
      siteId={site.id}
      watermark={site.watermark}
      backPath={site.basePath || '/'}
    />
  );
}
