import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { videoPreflight } from './timeline';
import type { VideoPayload } from './timeline';

interface JobStatus {
  id: string; state: string; framesRendered: number; frameCount: number; duration: number;
  error?: string; downloadUrl?: string;
}
export default function VideoExportDialog({ payload, onClose }: { payload: VideoPayload; onClose: () => void }) {
  const storageKey = `video-export:${payload.siteId}:${payload.lesson.meta.topicSlug}:${payload.lesson.meta.subtopicSlug}`;
  const [job, setJob] = useState<JobStatus | null>(() => {
    const id = sessionStorage.getItem(storageKey);
    return id ? { id, state: 'preparing', framesRendered: 0, frameCount: 0, duration: 0 } : null;
  });
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [options, setOptions] = useState(payload.options);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const preflight = useMemo(() => videoPreflight(payload.lesson), [payload.lesson]);
  const jobId = job?.id;
  const running = !!job && !['complete', 'failed', 'cancelled'].includes(job.state);
  const [previewWidth, setPreviewWidth] = useState(768);
  const previewHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = previewHost.current;
    if (!host) return;
    const observer = new ResizeObserver(() => setPreviewWidth(host.clientWidth));
    observer.observe(host); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'lesson-video-ready') setPreviewReady(true);
    };
    window.addEventListener('message', ready); return () => window.removeEventListener('message', ready);
  }, []);
  useEffect(() => {
    if (!jobId || !running) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/__video-export/${jobId}`, { signal: controller.signal });
        const next = await response.json();
        if (response.status === 404) {
          sessionStorage.removeItem(storageKey);
          setJob(current => current ? { ...current, state: 'failed', error: 'The export session ended. Start a new export.' } : null);
          return;
        }
        if (!response.ok) throw new Error(next.error || 'Unable to read export progress.');
        setError('');
        setJob(next);
        if (!['complete', 'failed', 'cancelled'].includes(next.state)) timeout = setTimeout(poll, 500);
      } catch (error) {
        if (!controller.signal.aborted) { setError((error as Error).message); timeout = setTimeout(poll, 1500); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [jobId, running, storageKey]);
  const start = async () => {
    setStarting(true); setError('');
    try {
      const response = await fetch('/__video-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, options }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Export could not start.');
      sessionStorage.setItem(storageKey, result.id);
      setJob({ ...result, state: 'preparing', framesRendered: 0, frameCount: 0, duration: 0 });
    } catch (error) { setError((error as Error).message); }
    finally { setStarting(false); }
  };
  const cancel = async () => {
    if (!job) return;
    try {
      const response = await fetch(`/__video-export/${job.id}/cancel`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not cancel the export.');
    } catch (error) { setError((error as Error).message); }
  };
  const seek = (value: number) => {
    setPreviewFrame(value);
    frame.current?.contentWindow?.postMessage({ type: 'lesson-video-seek', frame: value }, location.origin);
  };
  return createPortal(<div className="fixed inset-0 z-[200000] bg-black/80 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="video-export-title" className="w-full max-w-4xl max-h-[95vh] overflow-auto rounded-xl border border-white/15 bg-[#101214] text-slate-200 p-5 space-y-4">
      <div className="flex justify-between gap-4 items-center">
        <h2 id="video-export-title" className="text-lg font-semibold">Export video</h2>
        <button onClick={onClose} disabled={starting || job?.state === 'preparing'} className="disabled:opacity-30 px-3 py-1 border border-white/20 rounded">{job?.state === 'preparing' ? 'Preparing export…' : running ? 'Keep exporting & close' : 'Close'}</button>
      </div>
      <p className="text-sm text-slate-400">1920 × 1080 · 30 fps · MP4 · Full-frame canvas. Your current lesson is copied for export; editing data is not changed.</p>
      {!!preflight.length && <div role="alert" className="text-amber-300 bg-amber-400/10 rounded p-3 text-sm"><p>Resolve these before exporting:</p><ul className="list-disc pl-5">{preflight.map(message => <li key={message}>{message}</li>)}</ul></div>}
      {!job && <div className="flex flex-wrap items-center gap-5 text-sm">
        <label><input type="checkbox" checked={options.narration} onChange={e => setOptions({ ...options, narration: e.target.checked })} /> Include narration</label>
        <label><input type="checkbox" checked={options.background.enabled} onChange={e => setOptions({ ...options, background: { ...options.background, enabled: e.target.checked } })} /> Background music</label>
        <label>Final hold (seconds) <input type="number" min={0} max={30} step={.5} value={options.tailSeconds} onChange={e => setOptions({ ...options, tailSeconds: Number(e.target.value) })} className="w-16 ml-1 rounded bg-black/30 border border-white/20 px-2" /></label>
      </div>}
      {!payload.lesson.globalAudioFile && <p className="text-xs text-slate-400">No narration file is attached. Only attached step audio, enabled music and timeline sound effects will be included.</p>}
      {(error || job?.error) && <p role="alert" className="whitespace-pre-wrap text-sm text-red-300 bg-red-400/10 rounded p-3">{error || job?.error}</p>}
      {job && <div className="space-y-2 text-sm" role="status" aria-live="polite">
        <p>{job.state === 'complete' ? 'Video passed validation and is ready.' : job.state === 'rendering' ? `Rendering frame ${job.framesRendered} of ${job.frameCount}` : job.state === 'validating' ? 'Checking video dimensions, frame count and audio…' : job.state === 'encoding' ? 'Encoding audio and video…' : job.state === 'preparing' ? 'Preparing images, fonts and audio…' : job.state}</p>
        {running && <progress value={job.framesRendered} max={job.frameCount || 1} className="w-full" />}
      </div>}
      <div ref={previewHost} className="w-full">
        {job && ['rendering', 'encoding', 'validating'].includes(job.state) && <>
          <div className="relative overflow-hidden bg-black" style={{ height: previewWidth * 1080 / 1920 }}>
            <iframe ref={frame} title="Video frame preview" src={`/__video-render?job=${job.id}`} width={1920} height={1080} style={{ border: 0, transform: `scale(${previewWidth / 1920})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
          </div>
          <label className="text-xs text-slate-400">Preview frame {previewFrame} <input aria-label="Preview video frame" type="range" min={0} max={Math.max(0, job.frameCount - 1)} value={previewFrame} disabled={!previewReady} onChange={e => seek(Number(e.target.value))} className="w-full" /></label>
        </>}
        {job?.state === 'complete' && <video controls preload="metadata" src={`${job.downloadUrl}?inline=1`} className="w-full" />}
      </div>
      <div className="flex gap-3">
        {!job && <button onClick={() => void start()} disabled={starting || preflight.length > 0} className="px-4 py-2 rounded bg-cyan-600 text-white disabled:opacity-40">{starting ? 'Starting…' : 'Create MP4'}</button>}
        {running && <button onClick={() => void cancel()} className="px-4 py-2 rounded border border-red-400/40 text-red-300">Cancel export</button>}
        {job?.downloadUrl && <a href={job.downloadUrl} download="lesson-1080p.mp4" className="px-4 py-2 rounded bg-cyan-600 text-white">Download MP4</a>}
        {job && !running && <button onClick={() => { sessionStorage.removeItem(storageKey); setJob(null); setError(''); setPreviewReady(false); setPreviewFrame(0); }} className="px-4 py-2 border border-white/20 rounded">{job.state === 'complete' ? 'New export' : 'Try again'}</button>}
      </div>
    </section>
  </div>, document.body);
}
