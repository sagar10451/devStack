import { useCallback, useEffect, useState } from 'react';
import VideoScene from './VideoScene';
import type { VideoSceneAPI } from './VideoScene';
import { compileVideoTimeline } from './timeline';
import type { VideoPayload, VideoTimeline } from './timeline';

declare global {
  interface Window { __lessonVideo?: VideoSceneAPI; __lessonVideoError?: string }
}

export default function VideoRenderPage() {
  const [timeline, setTimeline] = useState<VideoTimeline | null>(null);
  const [error, setError] = useState('');
  const failed = useCallback((error: Error) => { window.__lessonVideoError = error.message; setError(error.message); }, []);
  const ready = useCallback((api: VideoSceneAPI) => {
    window.__lessonVideo = api;
    window.parent.postMessage({ type: 'lesson-video-ready' }, window.location.origin);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const job = new URLSearchParams(window.location.search).get('job');
    fetch(`/__video-export/${encodeURIComponent(job || '')}/snapshot`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('The video export session is unavailable.');
      const { payload, audioDuration } = await response.json() as { payload: VideoPayload; audioDuration: number };
      setTimeline(compileVideoTimeline(payload.lesson, audioDuration, payload.options.tailSeconds));
    }).catch(error => { if (!controller.signal.aborted) failed(error); });
    let seeking = false;
    let pending: number | null = null;
    const message = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'lesson-video-seek' || !window.__lessonVideo) return;
      pending = event.data.frame;
      if (seeking) return;
      seeking = true;
      try {
        while (pending !== null) {
          const frame = pending; pending = null;
          await window.__lessonVideo.seekFrame(frame);
          window.parent.postMessage({ type: 'lesson-video-seeked', frame }, window.location.origin);
        }
      }
      catch (error) { failed(error as Error); }
      finally { seeking = false; }
    };
    window.addEventListener('message', message);
    return () => { controller.abort(); window.removeEventListener('message', message); delete window.__lessonVideo; };
  }, [failed]);
  if (error) return <div role="alert">{error}</div>;
  return timeline ? <VideoScene timeline={timeline} onReady={ready} onError={failed} /> : <div>Preparing video stage…</div>;
}
