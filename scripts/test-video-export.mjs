import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = process.env.VIDEO_TEST_URL || 'http://127.0.0.1:5173';
const directory = await mkdtemp(join(tmpdir(), 'devstack-video-test-'));
const fixture = join(directory, 'fixture.json');
execFileSync(process.execPath, ['scripts/create-video-fixture.mjs', fixture], { stdio: 'inherit' });
const payload = JSON.parse(await readFile(fixture, 'utf8'));
async function submit(value) {
  const response = await fetch(`${base}/__video-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const body = await response.json();
  return { status: response.status, body };
}
const unsupported = structuredClone(payload);
unsupported.lesson.animationSteps[0].pinAsTitle = true;
assert.equal((await submit(unsupported)).status, 422, 'unsupported effects must fail before rendering');
const start = await submit(payload);
assert.equal(start.status, 202, JSON.stringify(start.body));
console.log(`Rendering integration fixture: ${start.body.id}`);
let previous = '', status;
const deadline = Date.now() + 240000;
while (Date.now() < deadline) {
  const response = await fetch(`${base}/__video-export/${start.body.id}`);
  status = await response.json();
  const progress = `${status.state}:${Math.floor(status.framesRendered / 30)}`;
  if (progress !== previous) { console.log(`${status.state} ${status.framesRendered}/${status.frameCount}`); previous = progress; }
  if (['complete', 'failed', 'cancelled'].includes(status.state)) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(status.state, 'complete', status.error || 'Export timed out.');
const output = join(directory, 'fixture.mp4');
const response = await fetch(`${base}${status.downloadUrl}`);
assert.equal(response.status, 200);
await writeFile(output, Buffer.from(await response.arrayBuffer()));
const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', output], { encoding: 'utf8' }));
const video = probe.streams.find(s => s.codec_type === 'video');
assert.equal(video.width, 1920); assert.equal(video.height, 1080);
assert.equal(video.r_frame_rate, '30/1'); assert.equal(Number(video.nb_read_frames), 93);
assert.ok(probe.streams.some(s => s.codec_type === 'audio'));
function pixel(at, x, y, file = output) {
  return [...execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-ss', String(at), '-i', file, '-vf', `crop=2:2:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
}
const red = pixel(0, 800, 540), blue = pixel(1.95, 800, 540), green = pixel(2.8, 800, 540);
assert.ok(red[0] > red[1] * 3 && red[0] > red[2] * 3, `First guide must be red: ${red}`);
assert.ok(blue[2] > blue[0] * 3 && blue[2] > blue[1] * 3, `Second guide must be blue: ${blue}`);
assert.ok(green[1] > green[0] * 3 && green[1] > green[2] * 3, `Second page must be green: ${green}`);
for (const [x, y] of [[4, 4], [1914, 4], [4, 1074], [1914, 1074]]) {
  const edge = pixel(0, x, y);
  assert.ok(edge[0] > edge[1] * 3 && edge[0] > edge[2] * 3, `Guide 1 must fill the frame, including (${x}, ${y}): ${edge}`);
}
for (const [at, channel] of [[1.95, 2], [2.8, 1]]) {
  const edge = pixel(at, 1914, 1074);
  assert.ok(edge[channel] > edge[0] * 3, `Later guides/pages must also fill the output: ${edge}`);
}
const pcm = execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
let sum = 0;
for (let i = 0; i < Math.min(pcm.length, 48000); i += 2) sum += Math.abs(pcm.readInt16LE(i));
assert.ok(sum > 1000000, 'Decoded audio must contain the original tone.');
function amplitude(at, frequency) {
  const count = 1200, first = Math.round(at * 48000);
  let real = 0, imaginary = 0;
  for (let i = 0; i < count; i++) {
    const value = pcm.readInt16LE((first + i) * 2);
    const angle = 2 * Math.PI * frequency * i / 48000;
    real += value * Math.cos(angle); imaginary += value * Math.sin(angle);
  }
  return 2 * Math.hypot(real, imaginary) / count;
}
assert.ok(amplitude(.9, 880) < 100, 'The second clip must not play before its timeline event.');
assert.ok(amplitude(1.05, 880) > 1500, 'The second clip must play at the Guide 2 event.');
assert.ok(amplitude(1.4, 880) < 100, 'The second clip must stop at its saved trim end.');
let markerOnset;
for (let at = .94; at <= 1.06; at += .005) if (amplitude(at, 880) > 1000) { markerOnset = at; break; }
assert.ok(markerOnset !== undefined && Math.abs(markerOnset - 1) < 1 / 30, `Audio marker timing must be within one video frame: ${markerOnset}`);
const range = await fetch(`${base}${status.downloadUrl}?inline=1`, { headers: { Range: 'bytes=0-99' } });
assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 100);
// Exercise frame-controlled masks, highlights, lasers, arrows and real text/font loading.
const effectFixture = join(directory, 'effects.json');
execFileSync(process.execPath, ['scripts/create-video-fixture.mjs', effectFixture, 'effects'], { stdio: 'inherit' });
const effectPayload = JSON.parse(await readFile(effectFixture, 'utf8'));
const effectStart = await submit(effectPayload);
assert.equal(effectStart.status, 202, JSON.stringify(effectStart.body));
console.log('Rendering mask/highlight/laser/font fixture');
let effects;
for (let i = 0; i < 480; i++) {
  effects = await (await fetch(`${base}/__video-export/${effectStart.body.id}`)).json();
  if (['complete', 'failed', 'cancelled'].includes(effects.state)) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.equal(effects.state, 'complete', effects.error || 'Effects export timed out.');
const effectsOutput = join(directory, 'effects.mp4');
await writeFile(effectsOutput, Buffer.from(await (await fetch(`${base}${effects.downloadUrl}`)).arrayBuffer()));
const gray = pixel(0, 768, 420, effectsOutput);
assert.ok(Math.max(...gray) - Math.min(...gray) < 8, `Mask must initially be grayscale: ${gray}`);
const revealed = pixel(1.75, 768, 420, effectsOutput);
assert.ok(revealed[0] > revealed[1] * 3, `Mask must reveal the original red image: ${revealed}`);
const highlighted = pixel(2.4, 288, 252, effectsOutput);
assert.ok(highlighted[0] < 50 && highlighted[1] > 10, `Green highlight must multiply the red image: ${highlighted}`);
const laser = pixel(1.5, 1176, 780, effectsOutput);
assert.ok(laser[0] > 240 && laser[1] > 35, `Recorded laser must be visible at its timestamp: ${laser}`);
const swipeBefore = pixel(.8, 1286, 432, effectsOutput);
assert.ok(Math.max(...swipeBefore) - Math.min(...swipeBefore) < 8, `Free S starts grayscale: ${swipeBefore}`);
const swipeLeft = pixel(1.06, 1286, 432, effectsOutput);
const swipeRight = pixel(1.06, 1536, 432, effectsOutput);
assert.ok(swipeLeft[0] > swipeLeft[1] * 3, `Free S must immediately sweep across its own bounds: ${swipeLeft}`);
assert.ok(Math.max(...swipeRight) - Math.min(...swipeRight) < 8, `Free S must preserve grayscale ahead of the swipe: ${swipeRight}`);
const swipeFinished = pixel(1.75, 1536, 432, effectsOutput);
assert.ok(swipeFinished[0] > swipeFinished[1] * 3, `Free S must finish after .8s: ${swipeFinished}`);
console.log(`Effects passed: grayscale=${gray}, reveal=${revealed}, highlight=${highlighted}, laser=${laser}`);
// Failure is explicit and cannot expose a download link.
const invalid = structuredClone(payload);
const store = invalid.lesson.snapshot.document.store;
store['asset:red'].props.src = '/notes/nonexistent-video-test.png';
const bad = await submit(invalid);
assert.equal(bad.status, 202);
let failed;
for (let i = 0; i < 40; i++) {
  failed = await (await fetch(`${base}/__video-export/${bad.body.id}`)).json();
  if (failed.state === 'failed') break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.equal(failed.state, 'failed'); assert.ok(failed.error); assert.equal(failed.downloadUrl, undefined);
const blocked = await fetch(`${base}/__video-export/${bad.body.id}/download`);
assert.equal(blocked.status, 409);
// Keep this job actively rendering long enough to cancel even when unchanged
// pauses are exported almost immediately through screenshot reuse.
const cancellationPayload = structuredClone(payload);
cancellationPayload.lesson.shapeAnimations['shape:red'] = { idle: 'float' };
cancellationPayload.lesson.globalAudioDurations.red = 10;
const cancel = await submit(cancellationPayload);
assert.equal(cancel.status, 202);
for (let i = 0; i < 200; i++) {
  const current = await (await fetch(`${base}/__video-export/${cancel.body.id}`)).json();
  if (current.state === 'rendering' && current.framesRendered >= 3) break;
  assert.notEqual(current.state, 'failed', current.error);
  assert.notEqual(current.state, 'complete', 'cancellation fixture must still be rendering');
  await new Promise(resolve => setTimeout(resolve, 100));
}
await fetch(`${base}/__video-export/${cancel.body.id}/cancel`, { method: 'POST' });
let cancelled;
for (let i = 0; i < 40; i++) {
  cancelled = await (await fetch(`${base}/__video-export/${cancel.body.id}`)).json();
  if (cancelled.state === 'cancelled') break;
  await new Promise(resolve => setTimeout(resolve, 100));
}
assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.downloadUrl, undefined);
console.log(JSON.stringify({ passed: true, output, effectsOutput, validation: { width: video.width, height: video.height, frames: video.nb_read_frames, audio: true, markerOnset }, red, blue, green }));
