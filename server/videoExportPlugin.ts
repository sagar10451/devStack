import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { compareRasterFrames } from './frameComparison.ts';
import { compileVideoTimeline, includedVideoRecords, VIDEO, videoPreflight } from '../src/canvas/video/timeline.ts';
import type { VideoPayload, VideoTimeline } from '../src/canvas/video/timeline.ts';

type JobState = 'preparing' | 'rendering' | 'encoding' | 'validating' | 'complete' | 'failed' | 'cancelled';
interface Job {
  id: string; payload: VideoPayload; state: JobState; framesRendered: number;
  frameCount: number; duration: number; audioDuration: number; error?: string;
  output?: string; controller: AbortController;
  metrics?: { capturedFrames: number; reusedFrames: number; preparationMs: number; renderMs: number; encodingMs: number; validationMs: number; totalMs: number };
}
interface Track { file: string; start: number; volume: number; loop?: boolean; length?: number }
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';

async function frameDeadline<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The video frame did not become ready within 30 seconds.')), 30000); })]);
  } finally { clearTimeout(timer); }
}

async function command(executable: string, args: string[], signal?: AbortSignal) {
  return await new Promise<string>((accept, reject) => {
    const child = spawn(executable, args, { signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-12000); });
    child.on('error', error => reject(new Error(`${basename(executable)}: ${error.message}`)));
    child.on('close', code => code === 0 ? accept(output) : reject(new Error(`${basename(executable)} failed: ${errors || code}`)));
  });
}
function projectFile(root: string, ...parts: string[]) {
  const file = resolve(root, ...parts);
  if (!file.startsWith(resolve(root) + sep)) throw new Error('Invalid asset path.');
  return file;
}
async function audioLength(file: string, signal: AbortSignal) {
  const result = JSON.parse(await command(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], signal));
  const duration = Number(result.format?.duration);
  if (!result.streams?.some((stream: { codec_type: string }) => stream.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid audio: ${basename(file)}`);
  return duration;
}
async function freezeImages(job: Job, baseURL: string) {
  for (const asset of includedVideoRecords(job.payload.lesson).assets.filter(record => record.type === 'image')) {
    const src = asset.props?.src;
    if (typeof src !== 'string' || !src) throw new Error(`Missing image source: ${asset.id}`);
    if (src.startsWith('data:image/')) continue;
    if (src.startsWith('blob:')) throw new Error('Reinsert temporary images before exporting; blob URLs cannot be opened in the renderer.');
    const url = new URL(src, baseURL);
    if (url.origin !== new URL(baseURL).origin || !(/^\/__load-image$/.test(url.pathname) || /\.(png|jpe?g|webp|svg|avif)$/i.test(url.pathname))) {
      throw new Error('Import external images into the canvas before exporting so their contents can be frozen.');
    }
    const response = await fetch(url, { signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) throw new Error(`Image could not be loaded: ${url.pathname}`);
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) throw new Error(`Invalid image content: ${url.pathname}`);
    asset.props!.src = `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  }
}

async function prepareAudio(job: Job, work: string, projectRoot: string) {
  const { lesson, siteId, options } = job.payload;
  const signal = job.controller.signal;
  const tracks: Track[] = [];
  if (options.narration && lesson.globalAudioFile) {
    const source = projectFile(join(projectRoot, 'data', 'audio'), siteId, lesson.meta.topicSlug, lesson.globalAudioFile);
    const file = join(work, 'narration.audio');
    await copyFile(source, file).catch(() => { throw new Error('Narration file is missing. Reattach the lesson audio.'); });
    job.audioDuration = await audioLength(file, signal);
    tracks.push({ file, start: 0, volume: 1 });
  }
  const timeline = compileVideoTimeline(lesson, job.audioDuration, options.tailSeconds);
  for (const event of timeline.events) {
    const audio = event.step.audio;
    if (!audio) continue;
    const match = audio.data.match(/^data:audio\/[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw new Error(`Reattach audio clip: ${audio.fileName}`);
    const raw = join(work, `clip-${event.index}.audio`);
    await writeFile(raw, Buffer.from(match[1], 'base64'));
    const sourceDuration = await audioLength(raw, signal);
    if (![audio.startTime, audio.endTime, audio.volume].every(Number.isFinite) || audio.startTime < 0 || audio.endTime <= audio.startTime || audio.endTime > sourceDuration + .05 || audio.volume < 0 || audio.volume > 1) throw new Error(`Invalid trim or volume: ${audio.fileName}`);
    const file = join(work, `clip-${event.index}.wav`);
    await command(ffmpeg, ['-v', 'error', '-y', '-ss', String(audio.startTime), '-i', raw, '-t', String(audio.endTime - audio.startTime), '-vn', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', file], signal);
    const next = timeline.events.find(e => e.start > event.start)?.start ?? timeline.duration;
    tracks.push({ file, start: event.start, volume: audio.volume, loop: audio.loop, length: audio.loop ? next - event.start : audio.endTime - audio.startTime });
  }
  if (options.background.enabled) {
    const source = projectFile(join(projectRoot, 'public'), 'sounds', 'bgmusic.mp3');
    const file = join(work, 'background.audio');
    await copyFile(source, file).catch(() => { throw new Error('Background music file is missing. Disable it or reattach it.'); });
    await audioLength(file, signal);
    if (!Number.isFinite(options.background.volume) || options.background.volume < 0 || options.background.volume > 1) throw new Error('Invalid background music volume.');
    tracks.push({ file, start: 0, volume: options.background.volume, loop: options.background.loop });
  }
  // Match the sound assets used by the editor's timeline actions. No computer
  // audio or microphone is recorded; all sound is mixed from frozen source files.
  const sounds = new Map<string, string>();
  for (const event of timeline.events) {
    let sound: string | undefined, volume = .7;
    if (event.step.label === 'Highlight' || event.step.introEffect === 'chapter') { sound = 'highlight_line.mp3'; volume = .2; }
    if (event.step.introEffect === 'electricity') { sound = 'intro-sheen.wav'; volume = .16; }
    if (['Mask', 'Paint B&W'].includes(event.step.label)) {
      const swipe = lesson.highlightRegions?.some(region => region.stepId === event.step.id && region.type === 'mask' && region.revealType === 'swipe' && (region.path?.length || 0) > 2);
      sound = swipe ? 'highlight_line.mp3' : 'border_animation.mp3';
      if (swipe) volume = .2;
    }
    if (event.step.action === 'topicRollCall' || event.step.action === 'topicGlowOne') sound = 'short_reveal.mp3';
    if (!sound) continue;
    let file = sounds.get(sound);
    if (!file) {
      file = join(work, sound);
      await copyFile(projectFile(join(projectRoot, 'public', 'sounds'), sound), file).catch(() => { throw new Error(`Missing sound effect: ${sound}`); });
      sounds.set(sound, file);
    }
    tracks.push({ file, start: event.start, volume });
  }
  return { timeline, tracks };
}

async function validateVideo(file: string, timeline: VideoTimeline, hasAudio: boolean, signal: AbortSignal) {
  const probe = JSON.parse(await command(ffprobe, ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file], signal));
  const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video');
  if (!video || video.width !== VIDEO.width || video.height !== VIDEO.height || video.r_frame_rate !== `${VIDEO.fps}/1` || Number(video.nb_read_frames) !== timeline.frameCount || Math.abs(Number(video.duration) - timeline.duration) > .002) throw new Error('Output failed resolution, frame count or duration validation.');
  if (hasAudio && !probe.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')) throw new Error('The output audio track is missing.');
  await command(ffmpeg, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], signal);
  return { width: video.width, height: video.height, fps: VIDEO.fps, frames: Number(video.nb_read_frames), duration: Number(video.duration), audio: hasAudio };
}

export async function renderVideoJob(job: Job, baseURL: string, projectRoot: string) {
  const started = performance.now();
  const metrics = { capturedFrames: 0, reusedFrames: 0, preparationMs: 0, renderMs: 0, encodingMs: 0, validationMs: 0, totalMs: 0 };
  job.metrics = metrics;
  const work = await mkdtemp(join(tmpdir(), 'devstack-video-'));
  let browserVersion = '';
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  const signal = job.controller.signal;
  try {
    await command(ffmpeg, ['-version'], signal);
    await command(ffprobe, ['-version'], signal);
    await freezeImages(job, baseURL);
    const { timeline, tracks } = await prepareAudio(job, work, projectRoot);
    job.duration = timeline.duration; job.frameCount = timeline.frameCount;
    const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
    if (!chrome) throw new Error('Chrome is required for local video rendering. Install Chrome or set CHROME_PATH.');
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: VIDEO.width, height: VIDEO.height, deviceScaleFactor: 1 }, args: ['--hide-scrollbars', '--disable-background-networking'] });
    signal.addEventListener('abort', () => { void browser?.close().catch(() => {}); }, { once: true });
    signal.throwIfAborted();
    browserVersion = await browser.version();
    job.state = 'rendering';
    const page = await browser.newPage();
    const captureSession = await page.createCDPSession();
    const captureFrame = async () => {
      const result = await frameDeadline(captureSession.send('Page.captureScreenshot', {
        format: 'png', fromSurface: true, captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: VIDEO.width, height: VIDEO.height, scale: 1 },
      }));
      return Buffer.from(result.data, 'base64');
    };
    let pageError: string | undefined;
    page.on('pageerror', error => { pageError = String(error); });
    await page.goto(`${baseURL}/__video-render?job=${job.id}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => { const api = globalThis as unknown as { __lessonVideo?: unknown; __lessonVideoError?: string }; return api.__lessonVideo || api.__lessonVideoError; }, { timeout: 60000 });
    const initialError = await page.evaluate(() => (globalThis as unknown as { __lessonVideoError?: string }).__lessonVideoError);
    if (initialError) throw new Error(initialError);
    metrics.preparationMs = Math.round(performance.now() - started);
    const renderStarted = performance.now();
    job.state = 'rendering';
    const silent = join(work, 'silent.mp4');
    const encoder = spawn(ffmpeg, ['-v', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(VIDEO.fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-frames:v', String(timeline.frameCount), '-movflags', '+faststart', silent], { signal, stdio: ['pipe', 'ignore', 'pipe'] });
    let encodingError = '';
    encoder.stderr.on('data', chunk => { encodingError = (encodingError + chunk).slice(-8000); });
    const encoded = new Promise<void>((accept, reject) => {
      encoder.on('error', reject);
      encoder.on('close', code => code === 0 ? accept() : reject(new Error(`Video encoding failed: ${encodingError}`)));
    });
    // Always attach a rejection handler while frames are being produced.
    void encoded.catch(() => {});
    encoder.stdin.on('error', () => {});
    let firstFrame: Buffer | undefined;
    let seekConsistency: ReturnType<typeof compareRasterFrames> | 'exact' = 'exact';
    let cachedPNG: Uint8Array | undefined;
    let reuseUntil = 0;
    try {
      for (let frame = 0; frame < timeline.frameCount; frame++) {
        signal.throwIfAborted();
        if (pageError) throw new Error(`Video stage error: ${pageError}`);
        if (!cachedPNG || frame >= reuseUntil) {
          const result = await frameDeadline(page.evaluate(async frame => {
            return await (globalThis as unknown as { __lessonVideo: { seekFrame: (frame: number) => Promise<{ reuseUntilFrame?: number } | void> } }).__lessonVideo.seekFrame(frame);
          }, frame));
          cachedPNG = await captureFrame();
          reuseUntil = result && Number.isInteger(result.reuseUntilFrame) && result.reuseUntilFrame! > frame ? Math.min(timeline.frameCount, result.reuseUntilFrame!) : frame + 1;
          metrics.capturedFrames++;
        } else metrics.reusedFrames++;
        if (frame === 0) firstFrame = Buffer.from(cachedPNG);
        await new Promise<void>((accept, reject) => encoder.stdin.write(cachedPNG!, error => error ? reject(error) : accept()));
        job.framesRendered = frame + 1;
      }
      // Finish the encoder before the backward-seek check, so a browser wait
      // cannot leave an encoder blocked indefinitely on its input pipe.
      encoder.stdin.end();
      await encoded;
      // Catch history-dependent rendering: the first frame must be identical
      // after seeking back from the final page/effect state.
      await frameDeadline(page.evaluate(async () => { await (globalThis as unknown as { __lessonVideo: { seekFrame: (frame: number) => Promise<void> } }).__lessonVideo.seekFrame(0); }));
      const repeated = await captureFrame();
      if (!firstFrame?.equals(Buffer.from(repeated))) {
        const decode = async (png: Uint8Array, name: string) => {
          const file = join(work, name); await writeFile(file, png);
          return await new Promise<Buffer>((resolve, reject) => {
            const child = spawn(ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { signal, killSignal: 'SIGKILL' });
            const chunks: Buffer[] = []; let error = '';
            child.stdout.on('data', chunk => chunks.push(chunk));
            child.stderr.on('data', chunk => { error += chunk; });
            child.on('error', reject);
            child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Frame validation failed: ${error}`)));
          });
        };
        const [a, b] = await Promise.all([decode(firstFrame!, 'first.png'), decode(repeated, 'repeated.png')]);
        seekConsistency = compareRasterFrames(a, b, VIDEO.width, VIDEO.height);
        if (!seekConsistency.matches) throw new Error('The scene changed when seeking backwards. Export stopped to avoid an inconsistent video.');
      }
    } catch (error) { encoder.stdin.destroy(); encoder.kill('SIGKILL'); await encoded.catch(() => {}); throw error; }
    metrics.renderMs = Math.round(performance.now() - renderStarted);
    await browser.close(); browser = undefined;
    job.state = 'encoding';
    const encodingStarted = performance.now();
    const output = join(work, 'validated.mp4');
    if (tracks.length) {
      const args = ['-v', 'error', '-y', '-i', silent];
      tracks.forEach(track => { if (track.loop) args.push('-stream_loop', '-1'); args.push('-i', track.file); });
      const filters = tracks.map((track, index) => `[${index + 1}:a]aresample=48000,asetpts=PTS-STARTPTS${track.length ? `,atrim=duration=${track.length}` : ''},volume=${track.volume},adelay=${Math.round(track.start * 48000)}S:all=1[a${index}]`);
      filters.push(`${tracks.map((_, index) => `[a${index}]`).join('')}amix=inputs=${tracks.length}:normalize=0:duration=longest,apad,atrim=duration=${timeline.duration}[mixed]`);
      args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mixed]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(timeline.duration), '-movflags', '+faststart', output);
      await command(ffmpeg, args, signal);
    } else await copyFile(silent, output);
    metrics.encodingMs = Math.round(performance.now() - encodingStarted);
    job.state = 'validating';
    const validationStarted = performance.now();
    const validation = { ...await validateVideo(output, timeline, tracks.length > 0, signal), seekConsistency };
    metrics.validationMs = Math.round(performance.now() - validationStarted);
    metrics.totalMs = Math.round(performance.now() - started);
    const directory = join(projectRoot, 'data', 'video-exports');
    await mkdir(directory, { recursive: true });
    const destination = join(directory, `${job.id}.mp4`);
    await copyFile(output, `${destination}.partial`);
    await writeFile(join(directory, `${job.id}.json`), JSON.stringify({ title: job.payload.lesson.meta.title, validation, performance: metrics, chromeVersion: browserVersion, createdAt: new Date().toISOString() }, null, 2));
    signal.throwIfAborted();
    await rename(`${destination}.partial`, destination);
    job.output = destination; job.state = 'complete';
  } catch (error) {
    job.state = signal.aborted ? 'cancelled' : 'failed';
    job.error = signal.aborted ? undefined : (error as Error).message;
  } finally {
    await browser?.close().catch(() => {});
    await rm(work, { recursive: true, force: true });
    if (job.state !== 'complete') {
      await rm(join(projectRoot, 'data', 'video-exports', `${job.id}.mp4.partial`), { force: true });
      await rm(join(projectRoot, 'data', 'video-exports', `${job.id}.json`), { force: true });
    }
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 100 * 1024 * 1024) throw new Error('The export snapshot exceeds 100 MB.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString()) as VideoPayload;
}
export function videoExportPlugin(): Plugin {
  const jobs = new Map<string, Job>();
  return {
    name: 'local-video-export',
    configureServer(server) {
      const close = () => { for (const job of jobs.values()) if (!['complete', 'failed', 'cancelled'].includes(job.state)) job.controller.abort(); };
      server.httpServer?.once('close', close);
      server.middlewares.use('/__video-export', async (request, response) => {
        try {
          const address = server.httpServer?.address();
          if (!address || typeof address === 'string') throw new Error('Local render server is unavailable.');
          if (request.headers.origin) {
            const origin = new URL(request.headers.origin);
            if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.port !== String(address.port)) return json(response, 403, { error: 'Export requests must come from this local editor.' });
          }
          const pathname = new URL(request.url || '/', 'http://localhost').pathname;
          const parts = pathname.split('/').filter(Boolean);
          if (!parts.length && request.method === 'POST') {
            if ([...jobs.values()].some(job => !['complete', 'failed', 'cancelled'].includes(job.state))) return json(response, 409, { error: 'Another export is running. Wait for it or cancel it.' });
            const payload = await body(request);
            if (!payload?.lesson || !payload.options?.background || typeof payload.siteId !== 'string') throw new Error('Invalid video export request.');
            const errors = videoPreflight(payload.lesson);
            if (errors.length) return json(response, 422, { error: errors.join('\n') });
            const timeline = compileVideoTimeline(payload.lesson, 0, payload.options.tailSeconds);
            const job: Job = { id: randomUUID(), payload, state: 'preparing', framesRendered: 0, frameCount: timeline.frameCount, duration: timeline.duration, audioDuration: 0, controller: new AbortController() };
            jobs.set(job.id, job);
            json(response, 202, { id: job.id });
            void renderVideoJob(job, `http://127.0.0.1:${address.port}`, server.config.root);
            return;
          }
          const job = jobs.get(parts[0]);
          if (!job) return json(response, 404, { error: 'Video export session not found.' });
          if (parts[1] === 'cancel' && request.method === 'POST') {
            if (!['complete', 'failed', 'cancelled'].includes(job.state)) job.controller.abort();
            return json(response, 200, { cancelled: true });
          }
          if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
          if (parts[1] === 'snapshot') {
            if (job.state === 'preparing') return json(response, 409, { error: 'Assets are still being prepared.' });
            return json(response, 200, { payload: job.payload, audioDuration: job.audioDuration });
          }
          if (parts[1] === 'download') {
            if (job.state !== 'complete' || !job.output) return json(response, 409, { error: 'The video has not passed validation yet.' });
            response.setHeader('Content-Type', 'video/mp4');
            const inline = new URL(request.url || '/', 'http://localhost').searchParams.has('inline');
            response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="lesson-1080p.mp4"`);
            response.setHeader('Accept-Ranges', 'bytes');
            const size = (await stat(job.output)).size;
            const range = request.headers.range;
            if (range) {
              const match = /^bytes=(\d+)-(\d*)$/.exec(range);
              if (!match) { response.statusCode = 416; response.end(); return; }
              const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
              if (start >= size || start > end) { response.statusCode = 416; response.setHeader('Content-Range', `bytes */${size}`); response.end(); return; }
              response.statusCode = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); response.setHeader('Content-Length', end - start + 1);
              createReadStream(job.output, { start, end }).pipe(response);
            } else { response.setHeader('Content-Length', size); createReadStream(job.output).pipe(response); }
            return;
          }
          return json(response, 200, { id: job.id, state: job.state, framesRendered: job.framesRendered, frameCount: job.frameCount, duration: job.duration, error: job.error, metrics: job.metrics, downloadUrl: job.state === 'complete' ? `/__video-export/${job.id}/download` : undefined });
        } catch (error) { json(response, 400, { error: (error as Error).message }); }
      });
    },
  };
}
