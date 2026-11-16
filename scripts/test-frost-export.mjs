// Exercises the real export stage without encoding a video or writing app data.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const directory = await mkdtemp(join(tmpdir(), 'devstack-frost-export-'));
const fixture = join(directory, 'lesson.json');
execFileSync(process.execPath, ['scripts/create-video-fixture.mjs', fixture]);
const payload = JSON.parse(await readFile(fixture, 'utf8'));
payload.lesson.animationSteps = [
  { id: 'intro', pageId: 'page:one', shapeIds: ['shape:red'], animation: 'none', duration: 0, label: 'Intro' },
  { id: 'image', pageId: 'page:two', shapeIds: ['shape:green'], animation: 'fadeIn', duration: 400, label: 'Image' },
  { id: 'paint', pageId: 'page:two', shapeIds: ['shape:green'], animation: 'appear', duration: 200, label: 'Paint B&W' },
];
payload.lesson.globalAudioDurations = { intro: .5, image: 1, paint: 1 };
payload.lesson.highlightRegions = [{ id: 'frost', stepId: 'paint', imageShapeId: 'shape:green', pageId: 'page:two', type: 'mask', revealType: 'swipe', path: [{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }, { x: .2, y: .8 }], x: 0, y: 0, w: 1, h: 1, color: '#111111' }];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 1920, height: 1080 } });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/snapshot')) void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ payload, audioDuration: 0 }) });
    else if (request.method() !== 'GET') void request.abort();
    else void request.continue();
  });
  await page.goto(`${process.env.VIDEO_TEST_URL || 'http://127.0.0.1:5173'}/__video-render?job=frost-test`);
  await page.waitForFunction(() => window.__lessonVideo || window.__lessonVideoError);
  assert.equal(await page.evaluate(() => window.__lessonVideoError), undefined);
  async function seek(frame) {
    return page.evaluate(async frame => {
      await window.__lessonVideo.seekFrame(frame);
      const image = document.querySelector('[data-shape-id="shape:green"]');
      const masks = [...document.querySelectorAll('[data-mask-image="shape:green"]')];
      return { image: image ? Number(getComputedStyle(image).opacity) : 0, masks: masks.map(el => ({ opacity: Number(getComputedStyle(el).opacity), own: Number(el.dataset.maskOpacity ?? 1) })) };
    }, frame);
  }
  assert.equal((await seek(29)).masks.length, 0, 'no glass on the preceding page');
  const first = await seek(30);
  assert.equal(first.image, 0);
  assert.equal(first.masks[0].opacity, 0, 'glass must be transparent on the first image frame');
  for (const frame of [31, 35, 43, 80, 90, 31]) {
    const state = await seek(frame);
    assert.ok(state.masks.length, `expected glass at frame ${frame}`);
    for (const mask of state.masks) assert.ok(Math.abs(mask.opacity - state.image * mask.own) < .00001, `glass must follow image opacity at frame ${frame}`);
  }
  assert.equal((await seek(102)).masks.length, 0, 'glass is removed after the sweep');
  console.log('Passed: export page change, first frame, fade, sweep glow, completed reveal and backward seek.');
} finally { await browser.close(); }
