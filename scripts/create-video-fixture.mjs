// Creates an isolated synthetic lesson. Never opens or overwrites user lessons.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTLStore, defaultShapeUtils, ImageShapeUtil, TextShapeUtil, toRichText, PageRecordType, AssetRecordType } from 'tldraw';

const destination = process.argv[2];
if (!destination) throw new Error('Provide a temporary fixture destination.');
const store = createTLStore({ shapeUtils: defaultShapeUtils });
store.put([PageRecordType.create({ id: 'page:one', name: 'Page 1', index: 'a1' }), PageRecordType.create({ id: 'page:two', name: 'Page 2', index: 'a2' })]);
for (const [name, color, page, x] of [['red', '#e02020', 'page:one', 0], ['blue', '#2020e0', 'page:one', 2000], ['green', '#20c020', 'page:two', 0]]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${color}"/><text x="80" y="120" font-size="64" fill="white">${name.toUpperCase()} GUIDE</text></svg>`;
  store.put([AssetRecordType.create({ id: `asset:${name}`, type: 'image', props: { w: 1600, h: 900, name, src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, isAnimated: false, mimeType: 'image/svg+xml' } })]);
  store.put([{ id: `shape:${name}`, typeName: 'shape', type: 'image', x, y: 0, rotation: 0, index: name === 'blue' ? 'a2' : 'a1', parentId: page, isLocked: false, opacity: 1, meta: {}, props: { ...ImageShapeUtil.prototype.getDefaultProps(), assetId: `asset:${name}`, w: 1600, h: 900 } }]);
}
const wav = join(dirname(destination), 'fixture-tone.wav');
execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000', '-c:a', 'pcm_s16le', wav]);
const marker = join(dirname(destination), 'fixture-marker.wav');
execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.3:sample_rate=48000', '-c:a', 'pcm_s16le', marker]);
const { readFileSync } = await import('node:fs');
const steps = [
  { id: 'red', shapeIds: ['shape:red'], pageId: 'page:one', animation: 'none', duration: 200, label: 'Red', cameraPosition: { x: 0, y: 0, z: 1 }, audio: { data: `data:audio/wav;base64,${readFileSync(wav).toString('base64')}`, fileName: 'fixture-tone.wav', startTime: 0, endTime: 3, loop: false, volume: .5 } },
  { id: 'blue', shapeIds: ['shape:blue'], pageId: 'page:one', animation: 'fadeIn', duration: 200, label: 'Blue', cameraPosition: { x: -2000, y: 0, z: 1 }, audio: { data: `data:audio/wav;base64,${readFileSync(marker).toString('base64')}`, fileName: 'fixture-marker.wav', startTime: 0, endTime: .3, loop: false, volume: .8 } },
  { id: 'green', shapeIds: ['shape:green'], pageId: 'page:two', animation: 'none', duration: 200, label: 'Green', cameraPosition: { x: 0, y: 0, z: 1 } },
];
const lesson = {
  version: 2, sceneLayout: true, meta: { title: 'Video export integration fixture', topicSlug: 'fixture', subtopicSlug: 'fixture', createdAt: '', updatedAt: '' },
  snapshot: { document: store.getStoreSnapshot('document') }, animationSteps: steps, shapeAnimations: {},
  globalAudioDurations: { red: .5, blue: .6, green: .3 },
  guideCountMap: { 'page:one': 2 }, guideBordersMap: { 'page:one': [{ x: 0, y: 0 }, { x: 2000, y: 0 }] },
  subTopicLabels: [{ id: 'topic-one', title: 'First page', startPage: 0, endPage: 0, startStep: 0, endStep: 1 }, { id: 'topic-two', title: 'Second page', startPage: 1, endPage: 1, startStep: 2, endStep: 2 }],
};
if (process.argv[3] === 'effects') {
  store.put([{ id: 'shape:text', typeName: 'shape', type: 'text', x: 100, y: 650, rotation: 0, index: 'a3', parentId: 'page:one', isLocked: false, opacity: 1, meta: {}, props: { ...TextShapeUtil.prototype.getDefaultProps(), richText: toRichText('Font readiness test'), font: 'sans', color: 'white', w: 600, autoSize: false } }]);
  lesson.snapshot.document = store.getStoreSnapshot('document');
  lesson.excludedPages = ['page:two'];
  lesson.guideCountMap = { 'page:one': 1 };
  lesson.animationSteps = [steps[0],
    { id: 'mask', shapeIds: ['shape:red'], pageId: 'page:one', animation: 'appear', duration: 200, label: 'Mask' },
    { id: 'highlight', shapeIds: ['shape:red'], pageId: 'page:one', animation: 'appear', duration: 200, label: 'Highlight' },
    { id: 'pointer', shapeIds: [], pageId: 'page:one', animation: 'appear', duration: 200, label: 'Pointer' },
  ];
  lesson.globalAudioDurations = { red: .4, mask: .4, highlight: .4, pointer: .4 };
  lesson.highlightRegions = [
    { id: 'swipe', stepId: 'mask', imageShapeId: 'shape:red', pageId: 'page:one', type: 'mask', revealType: 'swipe', path: [{ x: .65, y: .3 }, { x: .85, y: .3 }, { x: .85, y: .5 }, { x: .65, y: .5 }], x: 0, y: 0, w: 1, h: 1, color: '#111111' },
    { id: 'mask', stepId: 'mask', imageShapeId: 'shape:red', pageId: 'page:one', type: 'mask', x: .3, y: .3, w: .2, h: .2, color: '#111111' },
    { id: 'highlight', stepId: 'highlight', imageShapeId: 'shape:red', pageId: 'page:one', type: 'highlight', x: .1, y: .2, w: .1, h: .1, color: '#00ff00' },
  ];
  lesson.pointerArrows = [{ id: 'pointer', stepId: 'pointer', pageId: 'page:one', x: 1200, y: 300, rotation: 315, keepVisible: true, keepDuration: 5 }];
  lesson.laserStrokes = { 'page:one': [{ id: 'laser', cameraGroupIdx: 0, path: [{ x: 900, y: 650, t: 0 }, { x: 1000, y: 650, t: 250 }, { x: 1100, y: 650, t: 500 }] }] };
  lesson.laserTimings = { laser: 1.2 };
}
writeFileSync(destination, JSON.stringify({ siteId: 'fixture', lesson, options: { narration: false, tailSeconds: .1, background: { enabled: false, volume: .3, loop: false } } }));
store.dispose();
process.exit(0);
