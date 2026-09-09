import { useState, useEffect } from 'react';
import { usePortalSafe } from '../data/portalContext';
import LessonCanvas from '../canvas/LessonCanvas';
import PublicMarkdownViewer from '../canvas/PublicMarkdownViewer';
import type { LessonCanvasData, PublicCanvasData } from '../canvas/types';

interface LessonPageProps {
  topicSlug: string;
  subtopicSlug: string;
  topicTitle: string;
  subtopicTitle: string;
  basePath: string;
}

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export default function LessonPage({ topicSlug, subtopicSlug, topicTitle, subtopicTitle, basePath }: LessonPageProps) {
  const { site } = usePortalSafe();
  const [canvasData, setCanvasData] = useState<LessonCanvasData | null>(null);
  const [publicData, setPublicData] = useState<PublicCanvasData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [publicLoadFailed, setPublicLoadFailed] = useState(false);

  useEffect(() => {
    if (isLocalhost) {
      // Localhost: load main canvas from disk via Vite plugin
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
      // Production: fetch public-canvas.json (contains markdown content)
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
  }, [site.id, topicSlug, subtopicSlug]);

  if (!loaded) {
    return (
      <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Production: show markdown viewer
  if (!isLocalhost) {
    if (publicData) {
      return <PublicMarkdownViewer data={publicData} title={subtopicTitle} />;
    }
    if (publicLoadFailed) {
      return (
        <div className="w-full h-[calc(100vh-78px)] flex items-center justify-center bg-white">
          <div className="text-center">
            <p className="text-gray-500 text-lg font-medium">Notes coming soon</p>
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
      backPath={basePath ? basePath.replace(`/${subtopicSlug}`, '') : '/'}
    />
  );
}
