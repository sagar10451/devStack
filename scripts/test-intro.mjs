import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const base = process.env.VIDEO_TEST_URL || 'http://127.0.0.1:5173';
const directory = await mkdtemp(join(tmpdir(), 'devstack-intro-test-'));
const fixture = join(directory, 'lesson.json');
execFileSync(process.execPath, ['scripts/create-video-fixture.mjs', fixture], { stdio: 'inherit' });
const payload = JSON.parse(await readFile(fixture, 'utf8'));
const narration = join(directory, 'narration.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12:sample_rate=48000', narration]);
const narrationBytes = await readFile(narration);
payload.lesson.globalAudioFile = 'intro-test.wav';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 1600, height: 1000 } });
let saved;
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    // All app writes are intercepted. These tests never save a user lesson,
    // toolbar preferences, guide presets, or uploads to the running editor.
    if (request.method() === 'POST') {
      if (url.pathname === '/__save-canvas') saved = JSON.parse(request.postData()).data;
      void request.respond({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    } else if (url.pathname === '/__load-audio') void request.respond({ status: 200, contentType: 'audio/wav', body: narrationBytes });
    else if (url.pathname === '/__toolbar-preferences') void request.respond({ status: 200, contentType: 'application/json', body: '{"hiddenTools":[]}' });
    else void request.continue();
  });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('Intro page error:', error.message); });
  await page.goto(`${base}/__intro-test`);
  await page.evaluate(async lesson => {
    const { mountLesson } = await import('/scripts/intro-test-harness.tsx');
    mountLesson(lesson);
  }, payload.lesson);
  await page.waitForSelector('.tl-canvas');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Locked'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Locked').click());
  await page.waitForFunction(() => document.querySelector('[data-tool="intro"]') && !document.querySelector('[data-tool="intro"]').disabled);
  await page.click('[data-tool="intro"]');
  await page.waitForSelector('[data-intro-logo]');
  const first = await page.evaluate(() => {
    const editor = window.__introEditor;
    return { pages: editor.getPages(), shapes: editor.getCurrentPageShapes(), oldShape: editor.getShape('shape:red') };
  });
  assert.equal(first.pages[0].name, 'Intro');
  assert.equal(first.pages.length, 3);
  assert.equal(first.oldShape.x, 0); assert.equal(first.oldShape.y, 0);
  assert.equal(first.shapes.filter(shape => shape.type === 'intro-scene').length, 3);
  const introPage = first.pages[0].id;
  const chapter = first.shapes.find(shape => shape.props.role === 'chapter');
  await page.click('[data-tool="intro"]');
  assert.equal(await page.evaluate(() => window.__introEditor.getPages().length), 3, 'repeated click must not duplicate the intro');
  await page.evaluate(() => window.__introEditor.undo());
  assert.equal(await page.evaluate(() => window.__introEditor.getPages().length), 2, 'undo restores the original page list');
  await page.evaluate(() => window.__introEditor.redo());
  await page.waitForSelector('[data-intro-logo]');
  assert.equal(await page.evaluate(() => window.__introEditor.getPages()[0].id), introPage, 'redo restores the same intro page');
  await page.evaluate(id => window.__introEditor.setEditingShape(id), chapter.id);
  await page.locator('[aria-label="Intro chapter name"]').fill('The Rise of Nationalism in Europe');
  await page.evaluate(() => window.__introEditor.setEditingShape(null));
  await page.evaluate(() => window.__introEditor.createShapes([{ id: 'shape:intro-png-test', type: 'image', x: 260, y: 500, props: { assetId: 'asset:red', w: 300, h: 168.75 } }]));
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.click('[data-tool="save"]');
  for (let i = 0; i < 50 && !saved?.animationSteps.some(step => step.shapeIds.includes('shape:intro-png-test')); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(saved, 'the intro must save with the lesson');
  const introSteps = saved.animationSteps.filter(step => step.pageId === introPage);
  assert.equal(introSteps.length, 4, 'logo, electricity, chapter and PNG must have exactly one step each');
  assert.equal(introSteps.filter(step => step.introEffect === 'electricity').length, 1);
  assert.equal(introSteps.filter(step => step.introEffect === 'chapter').length, 1);
  assert.ok(saved.animationSteps.some(step => step.id === 'red'), 'existing steps must remain');
  assert.equal(saved.subTopicLabels[0].startPage, 1, 'topic associations must follow their original page');
  assert.equal(saved.globalAudioDurations.red, .5, 'existing audio timings must be preserved');
  const titleRecord = saved.snapshot.document.store[chapter.id];
  assert.equal(titleRecord.props.text, 'The Rise of Nationalism in Europe');
  assert.equal(titleRecord.props.effectStepId, chapter.props.effectStepId, 'editing title must preserve its timing identity');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Unlocked').click());
  await page.waitForFunction(() => document.querySelector('[data-intro-logo]')?.dataset.introLocked === 'true');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  try { await page.waitForSelector('[data-intro-electricity]', { timeout: 5000 }); }
  catch (error) { console.log(await page.evaluate(() => ({ logo: document.querySelector('[data-intro-logo]')?.outerHTML.slice(0, 300), counter: document.querySelector('[data-tool="nextstep"]')?.parentElement.textContent }))); throw error; }
  await page.screenshot({ path: join(directory, 'intro-electricity.png') });
  assert.equal(await page.$eval('[data-intro-highlight]', element => Number(element.dataset.progress)), 0, 'chapter highlight waits for its own step');
  assert.equal(await page.$eval('[data-intro-chapter] > div', element => getComputedStyle(element).clipPath), 'none', 'chapter text stays visible before its highlight');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  await page.waitForFunction(() => Number(document.querySelector('[data-intro-highlight]')?.dataset.progress) === 1);
  await page.click('[data-tool="playback"]');
  await page.waitForSelector('[data-intro-electricity]', { timeout: 6000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-intro-highlight]')?.dataset.progress) === 1, { timeout: 10000 });
  assert.ok(await page.evaluate(() => document.fullscreenElement !== null || document.documentElement.classList.contains('presenting-mode')), 'Quick Play must run the intro in presentation');
  assert.deepEqual(errors, []);
  console.log('Intro UI checks passed: insertion, existing content, repeat click, undo/redo, editable title, PNG registration, persistence, manual effects and Quick Play.');
} finally { await browser.close(); }

const introPage = Object.values(saved.snapshot.document.store).find(record => record.typeName === 'page' && record.meta?.introPage).id;
saved.excludedPages = Object.values(saved.snapshot.document.store).filter(record => record.typeName === 'page' && record.id !== introPage).map(record => record.id);
const introSteps = saved.animationSteps.filter(step => step.pageId === introPage);
saved.globalAudioDurations = Object.fromEntries(introSteps.map(step => [step.id, step.introEffect === 'electricity' ? .4 : step.introEffect === 'chapter' ? .25 : step.animation === 'none' ? 0 : .3]));
await writeFile(join(directory, 'intro-export.json'), JSON.stringify({ ...payload, lesson: saved }));
const response = await fetch(`${base}/__video-export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, lesson: saved }) });
const submitted = await response.json();
assert.equal(response.status, 202, JSON.stringify(submitted));
console.log(`Rendering intro preview: ${submitted.id}`);
let job;
for (let i = 0; i < 480; i++) {
  job = await (await fetch(`${base}/__video-export/${submitted.id}`)).json();
  if (i % 40 === 0) console.log(`Intro export: ${job.state} ${job.framesRendered}/${job.frameCount}`);
  if (['complete', 'failed', 'cancelled'].includes(job.state)) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!['complete', 'failed', 'cancelled'].includes(job.state)) await fetch(`${base}/__video-export/${submitted.id}/cancel`, { method: 'POST' });
assert.equal(job.state, 'complete', job.error || 'Intro export timed out.');
const output = join(directory, 'intro.mp4');
await writeFile(output, Buffer.from(await (await fetch(`${base}${job.downloadUrl}`)).arrayBuffer()));
function crop(at, rectangle) {
  return execFileSync('ffmpeg', ['-v', 'error', '-ss', String(at), '-i', output, '-vf', `crop=${rectangle}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 16 * 1024 * 1024 });
}
function count(buffer, predicate) { let count = 0; for (let i = 0; i < buffer.length; i += 3) if (predicate(buffer[i], buffer[i + 1], buffer[i + 2])) count++; return count; }
const titleBox = '1300:120:300:370';
const dark = (r, g, b) => Math.max(r, g, b) < 65;
const before = count(crop(.1, titleBox), dark), during = count(crop(.7, titleBox), dark), after = count(crop(1.9, titleBox), dark);
assert.ok(before > 100 && Math.abs(after - before) < before * .1, `chapter text must be visible from the start: ${before}, ${after}`);
const yellow = (r, g, b) => r > 180 && g > 160 && b < 120;
const markerBefore = count(crop(.1, titleBox), yellow), markerDuring = count(crop(.7, titleBox), yellow), markerAfter = count(crop(1.9, titleBox), yellow);
assert.ok(markerAfter > markerDuring && markerDuring > markerBefore, `chapter marker must sweep behind visible text: ${markerBefore}, ${markerDuring}, ${markerAfter}`);
const champagne = (r, g, b) => r > 140 && r > g && g > b * 1.15 && b > 65;
const active = count(crop(.35, '1600:260:200:40'), champagne), settled = count(crop(2.3, '1600:260:200:40'), champagne);
assert.ok(active > settled + 100, `electricity must appear and settle in the MP4: ${active}, ${settled}`);
const png = crop(2.1, '2:2:400:650');
assert.ok(png[0] > png[1] * 3, 'PNG must appear at its own timeline step');
console.log(JSON.stringify({ passed: true, output, screenshot: join(directory, 'intro-electricity.png'), titlePixels: { before, during, after }, electricityPixels: { active, settled } }));
