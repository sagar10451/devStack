import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileVideoTimeline, shapeStateAt, videoStateAt, videoPreflight, includedVideoRecords } from '../src/canvas/video/timeline.ts';
import { computeGoNextTimes, computeTimedEntries } from '../src/canvas/audioTimingUtils.ts';
import { createFramePlan, reuseUntilFrame } from '../src/canvas/video/framePlan.ts';
import { SWIPE_SECONDS, swipeProgressAt, swipeRevealAt } from '../src/canvas/swipeReveal.ts';
import { logoSheenStateAt, introPlaybackAt } from '../src/canvas/intro/playback.ts';

function lesson(steps = []) {
  return {
    sceneLayout: true, snapshot: { document: { store: {
      'page:a': { id: 'page:a', typeName: 'page', index: 'a1' },
      'page:b': { id: 'page:b', typeName: 'page', index: 'a2' },
      'shape:a': { id: 'shape:a', typeName: 'shape', type: 'image', parentId: 'page:a', props: { assetId: 'asset:a' } },
      'shape:b': { id: 'shape:b', typeName: 'shape', type: 'image', parentId: 'page:b', props: { assetId: 'asset:b' } },
      'asset:a': { id: 'asset:a', typeName: 'asset', type: 'image', props: {} },
      'asset:b': { id: 'asset:b', typeName: 'asset', type: 'image', props: {} },
    } } }, animationSteps: steps, shapeAnimations: {}, subTopicLabels: [],
  };
}
function step(id, patch = {}) {
  return { id, shapeIds: ['shape:a'], pageId: 'page:a', label: id, animation: 'appear', duration: 400, ...patch };
}
test('export shares normal playback timestamps, including merged and preloaded steps', () => {
  const source = lesson([step('first', { animation: 'none' }), step('second'), step('third')]);
  source.globalAudioDurations = { first: .5, second: 1, __merge_third: 1 };
  const timeline = compileVideoTimeline(source);
  const expected = computeGoNextTimes({ steps: source.animationSteps, pageIds: ['page:a', 'page:b'], durations: source.globalAudioDurations, pageTopicVisible: new Set(), pageSubtitleVisible: new Set(), pageTopicModes: {}, pageSubtitleModes: {} });
  assert.deepEqual(timeline.events.map(event => event.start), expected);
  assert.deepEqual(expected, [0, 1, 1]);
});
test('multiple guides use timeline cameras, never the guide selected during editing', () => {
  const source = lesson([step('first', { cameraPosition: { x: 0, y: 0, z: 1 } }), step('second', { cameraPosition: { x: -2000, y: -100, z: 1 } }), step('page', { pageId: 'page:b', cameraPosition: { x: 0, y: 0, z: 1 } })]);
  source.activeGuideMap = { 'page:a': 1 };
  const timeline = compileVideoTimeline(source);
  assert.deepEqual(videoStateAt(timeline, 0).camera, { x: 0, y: 0, z: 1 });
  assert.deepEqual(videoStateAt(timeline, 4.4).camera, { x: -2000, y: -100, z: 1 });
  assert.equal(videoStateAt(timeline, 7).pageId, 'page:b');
  assert.deepEqual(videoStateAt(timeline, 7).camera, { x: 0, y: 0, z: 1 });
  const expected = videoStateAt(timeline, 3.9);
  videoStateAt(timeline, 20); videoStateAt(timeline, 0);
  assert.deepEqual(videoStateAt(timeline, 3.9), expected);
});
test('overlapping camera moves start from the prior move at the new event time', () => {
  const source = lesson([step('a', { cameraPosition: { x: 0, y: 0, z: 1 } }), step('b', { cameraPosition: { x: -100, y: 0, z: 1 } }), step('c', { cameraPosition: { x: -200, y: 0, z: 1 } })]);
  source.globalAudioDurations = { a: 0, b: .1 };
  const timeline = compileVideoTimeline(source);
  // a and b start at 0; c starts at .6 while b is still moving.
  const before = -100 * (1 - (.25 ** 3));
  assert.ok(Math.abs(videoStateAt(timeline, .6).camera.x - before) < 1e-9);
  assert.equal(videoStateAt(timeline, 2).camera.x, -200);
});
test('visibility, move, teleport and backwards seeks are independent of playback history', () => {
  const source = lesson([step('show'), step('move', { action: 'move', targetPosition: { x: 200, y: 300 } }), step('exit', { action: 'exit' })]);
  const before = structuredClone(source);
  const timeline = compileVideoTimeline(source);
  assert.equal(shapeStateAt(timeline, 'shape:a', 0).visible, true);
  assert.deepEqual(shapeStateAt(timeline, 'shape:a', 4).position, { x: 200, y: 300 });
  assert.equal(shapeStateAt(timeline, 'shape:a', 8).visible, false);
  assert.equal(shapeStateAt(timeline, 'shape:a', 0).position, undefined);
  assert.deepEqual(source, before);
  const teleport = compileVideoTimeline(lesson([step('teleport', { action: 'teleport', duration: 1000, targetPosition: { x: 1, y: 2 } })]));
  assert.equal(shapeStateAt(teleport, 'shape:a', .25).visible, false);
  assert.equal(shapeStateAt(teleport, 'shape:a', .75).visible, true);
});
test('overlay-only steps and timing-only steps never hide their base image', () => {
  const overlays = compileVideoTimeline(lesson([step('mask', { label: 'Mask' })]));
  assert.equal(shapeStateAt(overlays, 'shape:a', 0).visible, true);
  const timing = compileVideoTimeline(lesson([step('wait', { action: 'none' })]));
  assert.equal(shapeStateAt(timing, 'shape:a', 0).visible, true);
});
test('audio and laser tails determine the full duration without accumulating frame drift', () => {
  const source = lesson([step('first')]);
  source.globalAudioDurations = { first: .1 };
  source.animationSteps[0].audio = { startTime: 0, endTime: 9, loop: false };
  assert.equal(compileVideoTimeline(source, 10, .5).frameCount, 315);
  assert.equal(compileVideoTimeline(source, 0, 1).duration, 10);
  source.laserStrokes = { 'page:a': [{ id: 'laser', path: [{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 2000 }] }] };
  source.laserTimings = { laser: 10 };
  assert.equal(compileVideoTimeline(source, 0, 0).duration, 12);
});
test('excluded pages do not contribute events, missing assets, or laser timing failures', () => {
  const source = lesson([step('old', { pageId: undefined }), step('new', { pageId: 'page:b', shapeIds: ['shape:b'] })]);
  source.excludedPages = ['page:a'];
  source.laserStrokes = { 'page:a': [{ path: [] }] };
  assert.deepEqual(compileVideoTimeline(source).events.map(e => e.step.id), ['new']);
  assert.deepEqual(includedVideoRecords(source).assets.map(r => r.id), ['asset:b']);
});
test('invalid and unsupported inputs are reported before an output can be produced', () => {
  assert.throws(() => compileVideoTimeline(lesson([step('bad', { duration: -1 })])), /duration/);
  assert.throws(() => compileVideoTimeline(lesson([step('bad', { cameraPosition: { x: 0, y: 0, z: 0 } })])), /camera/);
  assert.ok(videoPreflight(lesson([step('pin', { pinAsTitle: true })])).some(error => error.includes('Pinned')));
  const missing = lesson([step('missing', { shapeIds: ['shape:missing'] })]);
  assert.ok(videoPreflight(missing).some(error => error.includes('Missing timeline')));
  const noCamera = lesson([step('first')]); noCamera.guideCountMap = { 'page:a': 2 };
  assert.ok(videoPreflight(noCamera).some(error => error.includes('camera positions')));
  const rough = lesson([step('first', { cameraPosition: { x: 0, y: 0, z: 1 } })]); rough.canvasMode = 'rough';
  assert.throws(() => compileVideoTimeline(rough), /audio start/);
});

test('static pauses can reuse pixels without removing any output frames', () => {
  const source = lesson([step('still', { animation: 'none' })]);
  source.globalAudioDurations = { still: 10 };
  const timeline = compileVideoTimeline(source, 0, 0);
  const plan = createFramePlan(timeline);
  assert.equal(timeline.frameCount, 300);
  assert.equal(reuseUntilFrame(plan, 1, false), 300);
  assert.equal(reuseUntilFrame(plan, 100, true), 101, 'an actual running/looping CSS effect always disables reuse');
});
test('reuse stops on both sides of fractional event times and strict arrow expiry', () => {
  const source = lesson([step('a', { animation: 'none' }), step('b')]);
  source.globalAudioDurations = { a: .25 };
  source.pointerArrows = [{ id: 'arrow', stepId: 'b', pageId: 'page:a', keepDuration: .5 }];
  const timeline = compileVideoTimeline(source);
  const plan = createFramePlan(timeline);
  // b starts at .75 (between output frames 22 and 23).
  assert.equal(reuseUntilFrame(plan, 1, false), 22);
  assert.ok(plan.boundaries.includes(23));
  assert.ok(plan.boundaries.includes(38), 'expiry at 1.25s must not be skipped');
  assert.ok(plan.boundaries.includes(39), 'the first frame after expiry must not be skipped');
});
test('camera, laser and swipe windows cannot be replaced by held screenshots', () => {
  const source = lesson([step('a', { cameraPosition: { x: 0, y: 0, z: 1 } }), step('b', { cameraPosition: { x: -2000, y: 0, z: 1 } })]);
  source.globalAudioDurations = { a: .5 };
  source.laserStrokes = { 'page:a': [{ id: 'laser', path: [{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 1000 }] }] };
  source.laserTimings = { laser: 4 };
  source.highlightRegions = [{ pageId: 'page:a', stepId: 'b', type: 'mask', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], revealType: 'swipe' }];
  const plan = createFramePlan(compileVideoTimeline(source));
  assert.equal(reuseUntilFrame(plan, 40, false), 41, 'camera / swipe is changing at this frame');
  assert.equal(reuseUntilFrame(plan, 135, false), 136, 'laser stroke is still being drawn');
  assert.ok(reuseUntilFrame(plan, 152, false) > 153, 'a completed stroke can stay unchanged during a pause');
});
test('SVG image animation cannot accidentally enter the static screenshot cache', () => {
  const source = lesson([step('still', { animation: 'none' })]);
  const asset = source.snapshot.document.store['asset:a'];
  asset.props = { mimeType: 'image/svg+xml', src: `data:image/svg+xml;base64,${Buffer.from('<svg><animate attributeName="opacity" dur="1s"/></svg>').toString('base64')}` };
  const plan = createFramePlan(compileVideoTimeline(source));
  assert.equal(reuseUntilFrame(plan, 10, false), 11);
});

test('short highlight steps keep their full wipe and glow, for rectangles and clouds', () => {
  for (const shape of [undefined, 'cloud']) {
    const source = lesson([step('highlight', { label: 'Highlight', duration: 100 })]);
    source.highlightRegions = [{ pageId: 'page:a', stepId: 'highlight', type: 'highlight', shape }];
    const plan = createFramePlan(compileVideoTimeline(source, 0, 3));
    assert.equal(reuseUntilFrame(plan, 0, false), 1);
    assert.equal(reuseUntilFrame(plan, 7, false), 8, 'wipe continues after the 100ms step');
    assert.ok(plan.boundaries.includes(15), 'wipe finishes at .5s');
    assert.equal(reuseUntilFrame(plan, 22, false), 23, 'glow continues after the wipe');
    assert.equal(reuseUntilFrame(plan, 30, false), 31, 'capture the final glow frame');
    assert.ok(reuseUntilFrame(plan, 31, false) > 32, 'static caching resumes after the glow');
  }
});

test('Free S uses .8s with the highlight easing regardless of region position or width', () => {
  assert.equal(SWIPE_SECONDS, .8);
  assert.equal(swipeProgressAt(-1), 0);
  assert.equal(swipeProgressAt(0), 0);
  // Bezier parameter t=.5 gives x=.35, y=.5 for cubic-bezier(.4,0,.2,1).
  assert.ok(Math.abs(swipeProgressAt(.28) - .5) < 1e-8);
  assert.ok(Math.abs(swipeProgressAt(.4) - .7755613111) < 1e-8);
  assert.equal(swipeProgressAt(.8), 1);
  for (const [left, right] of [[0, 1], [.4, .6], [.8, .85]]) {
    const path = [{ x: left, y: .2 }, { x: right, y: .2 }, { x: right, y: .4 }, { x: left, y: .4 }];
    const middle = swipeRevealAt(path, .28);
    assert.ok(Math.abs(middle.front - (left + right) / 2) < 1e-8);
    assert.equal(swipeRevealAt(path, .8).progress, 1);
    assert.ok(swipeRevealAt(path, .6).glow > 0, 'glow continues after the swipe');
    assert.equal(swipeRevealAt(path, 1).glow, 0);
    assert.equal(swipeRevealAt(path, -1).progress, 0, 'backward seeking restores the full grayscale region');
    assert.equal(swipeRevealAt(path, -1).glow, 0);
  }
});

test('Free S screenshot caching waits for the .8s wipe and one-second glow', () => {
  const source = lesson([step('swipe', { label: 'Paint B&W', duration: 100 })]);
  source.highlightRegions = [{ pageId: 'page:a', stepId: 'swipe', type: 'mask', revealType: 'swipe', path: [{ x: .4, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .4 }] }];
  source.globalAudioDurations = { swipe: .1 };
  assert.equal(compileVideoTimeline(source, 0, 0).duration, 1, 'the final swipe/glow cannot be truncated by zero final hold');
  const plan = createFramePlan(compileVideoTimeline(source, 0, 3));
  assert.ok(plan.boundaries.includes(24));
  for (const frame of [0, 7, 15, 22, 30]) assert.equal(reuseUntilFrame(plan, frame, false), frame + 1);
  assert.ok(reuseUntilFrame(plan, 31, false) > 32);
});

test('audio timing gives merged Free S steps their own reveal phase even when the step index advances past them', () => {
  const steps = [step('image', { animation: 'none' }), step('swipe', { label: 'Paint B&W' }), step('next')];
  const times = new Map(computeTimedEntries({
    steps, pageIds: ['page:a'], durations: { __merge_swipe: 1, __merge_next: 1 },
    pageTopicVisible: new Set(), pageSubtitleVisible: new Set(), pageTopicModes: {}, pageSubtitleModes: {},
  }).map(entry => [entry.id, entry.start]));
  assert.equal(times.get('swipe'), times.get('next'), 'automatic playback can land on next without visiting swipe separately');
  const path = [{ x: .4, y: .2 }, { x: .6, y: .2 }, { x: .6, y: .4 }, { x: .4, y: .4 }];
  const audioTime = times.get('swipe') + .28;
  const reveal = swipeRevealAt(path, audioTime - times.get('swipe'));
  assert.ok(Math.abs(reveal.front - .5) < 1e-8, 'the audio clock still places the swipe halfway across the region');
  assert.equal(swipeRevealAt(path, times.get('swipe') - .1 - times.get('swipe')).progress, 0);
  assert.equal(swipeRevealAt(path, audioTime + .8 - times.get('swipe')).progress, 1);
});

test('intro effects stay deterministic on backward seeks and disable static frame reuse until finished', () => {
  const source = lesson([
    step('logo', { animation: 'none' }),
    step('electric', { animation: 'none', action: 'none', introEffect: 'electricity', duration: 2200 }),
    step('chapter', { animation: 'none', action: 'none', introEffect: 'chapter', duration: 800 }),
  ]);
  source.globalAudioDurations = { logo: 0, electric: .4, chapter: .1 };
  const timeline = compileVideoTimeline(source, 0, 0);
  assert.ok(timeline.duration >= 2.2, 'short scheduling durations cannot truncate electricity');
  assert.ok(introPlaybackAt(timeline.events, .2).elapsed.electric >= 0);
  assert.ok(introPlaybackAt(timeline.events, .2).elapsed.chapter < 0, 'chapter has a separate reveal marker');
  const expected = introPlaybackAt(timeline.events, .2);
  introPlaybackAt(timeline.events, 10);
  assert.deepEqual(introPlaybackAt(timeline.events, .2), expected);
  const active = logoSheenStateAt(.6);
  assert.ok(active.visible && active.opacity > 0);
  assert.deepEqual(logoSheenStateAt(.6), active);
  assert.equal(logoSheenStateAt(-1).visible, false);
  assert.equal(logoSheenStateAt(2.2).visible, false);
  assert.equal(reuseUntilFrame(createFramePlan(timeline), 30, false), 31);
});

test('adding an intro preserves the original first content page topic in Audio Sync', () => {
  const entries = computeTimedEntries({
    steps: [step('electric', { pageId: 'page:intro', introEffect: 'electricity', action: 'none' }), step('lesson')],
    pageIds: ['page:intro', 'page:a'], durations: {},
    pageTopicVisible: new Set(['page:a']), pageSubtitleVisible: new Set(), pageTopicModes: { 'page:a': 'animate' }, pageSubtitleModes: {},
  });
  assert.deepEqual(entries.map(entry => entry.id), ['electric', '__topic__page:a', 'lesson']);
});
