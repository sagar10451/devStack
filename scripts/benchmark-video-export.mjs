import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Run --baseline against the untouched reference server, then --optimized
// against the updated editor. The same frozen lesson payloads are reused.
const baseline = process.argv.includes('--baseline');
const names = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8).split(',') || ['guides', 'effects', 'still'];
const directory = process.env.VIDEO_BENCHMARK_DIR || '/tmp/devstack-video-benchmark';
const base = process.env.VIDEO_TEST_URL || (baseline ? 'http://127.0.0.1:5175' : 'http://127.0.0.1:5173');
await mkdir(directory, { recursive: true });
const manifestPath = join(directory, 'baseline.json');
const manifest = baseline ? [] : JSON.parse(await readFile(manifestPath, 'utf8'));
if (baseline && !process.argv.some(arg => arg.startsWith('--cases='))) {
  for (const [name, mode] of [['guides', ''], ['effects', 'effects']]) {
    execFileSync(process.execPath, ['scripts/create-video-fixture.mjs', join(directory, `${name}.json`), mode], { stdio: 'inherit' });
  }
  const still = JSON.parse(await readFile(join(directory, 'effects.json'), 'utf8'));
  still.lesson.animationSteps = [still.lesson.animationSteps[0]];
  still.lesson.globalAudioDurations = { red: 9.9 };
  delete still.lesson.highlightRegions; delete still.lesson.pointerArrows;
  delete still.lesson.laserStrokes; delete still.lesson.laserTimings;
  await writeFile(join(directory, 'still.json'), JSON.stringify(still));
}
const results = [];
for (const name of names) {
  const payload = await readFile(join(directory, `${name}.json`), 'utf8');
  const started = performance.now();
  const response = await fetch(`${base}/__video-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
  const submitted = await response.json();
  assert.equal(response.status, 202, JSON.stringify(submitted));
  let job;
  while (performance.now() - started < 300000) {
    job = await (await fetch(`${base}/__video-export/${submitted.id}`)).json();
    if (['complete', 'failed', 'cancelled'].includes(job.state)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const elapsedMs = Math.round(performance.now() - started);
  assert.equal(job.state, 'complete', job.error || 'Export timed out.');
  const file = join(directory, `${name}-${baseline ? 'baseline' : 'optimized'}.mp4`);
  await writeFile(file, Buffer.from(await (await fetch(`${base}${job.downloadUrl}`)).arrayBuffer()));
  const hashes = execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], { encoding: 'utf8' }).split('\n').filter(line => line && !line.startsWith('#'));
  const audioHash = execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();
  const result = { name, elapsedMs, frameCount: hashes.length, frameHashes: hashes, audioHash, metrics: job.metrics, file };
  if (!baseline) {
    const reference = manifest.find(result => result.name === name);
    const mismatches = hashes.flatMap((hash, index) => hash === reference.frameHashes[index] ? [] : [index]);
    assert.equal(hashes.length, reference.frameHashes.length, `${name}: frame count must match`);
    assert.equal(mismatches.length, 0, `${name}: decoded frames differ at ${mismatches.join(', ')}`);
    assert.equal(result.audioHash, reference.audioHash, `${name}: decoded audio must be unchanged`);
    result.speedup = Number((reference.elapsedMs / elapsedMs).toFixed(2));
  }
  results.push(result);
  await writeFile(baseline ? manifestPath : join(directory, 'optimized.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ...result, frameHashes: undefined, audioHash: undefined }));
}
await writeFile(baseline ? manifestPath : join(directory, 'optimized.json'), JSON.stringify(results, null, 2));
console.log(baseline ? 'Reference benchmarks saved.' : 'All decoded frames and audio match the reference.');
