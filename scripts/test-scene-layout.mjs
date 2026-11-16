import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENE, clampGuideIndex, nextSceneOrigin, resolveSceneGuides, fitImageToScene, getSceneCamera, setSceneCamera, getSceneOutputCamera } from '../src/canvas/sceneLayout.ts';

test('adding guides preserves existing positions and leaves a gap after every existing scene', () => {
  const saved = [{ x: -500, y: 700 }, { x: 9000, y: -300 }, { x: 50, y: 20 }];
  const before = structuredClone(saved);
  const expanded = resolveSceneGuides(6, saved);
  assert.deepEqual(saved, before);
  assert.deepEqual(expanded.slice(0, saved.length), saved);
  for (let i = saved.length; i < expanded.length; i++) {
    for (const earlier of expanded.slice(0, i)) {
      assert.ok(expanded[i].x >= earlier.x + SCENE.width + 80);
    }
  }
  assert.deepEqual(nextSceneOrigin([]), { x: 0, y: 0 });
  assert.deepEqual(resolveSceneGuides(3), [{ x: 0, y: 0 }, { x: 1680, y: 0 }, { x: 3360, y: 0 }]);
});

test('explicitly chosen guides determine image placement independently of the viewport', () => {
  const guides = resolveSceneGuides(3);
  const imageInGuide1 = fitImageToScene(1920, 1080, guides[0]);
  const imageInGuide3 = fitImageToScene(1920, 1080, guides[2]);
  assert.deepEqual(imageInGuide1, { x: 0, y: 0, w: 1600, h: 900 });
  assert.deepEqual(imageInGuide3, { x: 3360, y: 0, w: 1600, h: 900 });
  assert.equal(clampGuideIndex(2, 3), 2);
  assert.equal(clampGuideIndex(2, 2), 1, 'removing the selected last guide selects a remaining guide');
  assert.equal(clampGuideIndex(-1, 2), 0);
  assert.equal(clampGuideIndex(NaN, 2), 0);
  assert.deepEqual(resolveSceneGuides(2, guides), guides.slice(0, 2));
});

test('a 16:9 image fills the scene exactly, including a moved scene', () => {
  assert.deepEqual(fitImageToScene(3840, 2160), { x: 0, y: 0, w: 1600, h: 900 });
  assert.deepEqual(fitImageToScene(1920, 1080, { x: 2000, y: 100 }), { x: 2000, y: 100, w: 1600, h: 900 });
  assert.equal(SCENE.width / SCENE.height, 16 / 9);
  assert.equal(SCENE.outputWidth / SCENE.outputHeight, 16 / 9);
});

test('existing guides fill the complete 1080p output without changing saved coordinates', () => {
  for (const origin of [{ x: 0, y: 0 }, { x: 2000, y: -100 }]) {
    const camera = { x: -origin.x, y: -origin.y, z: 1 };
    const before = structuredClone(camera);
    const outputCamera = getSceneOutputCamera(camera);
    const image = fitImageToScene(1920, 1080, origin);
    assert.deepEqual(camera, before);
    assert.equal((image.x + outputCamera.x) * outputCamera.z, 0);
    assert.equal((image.y + outputCamera.y) * outputCamera.z, 0);
    assert.equal((image.x + image.w + outputCamera.x) * outputCamera.z, 1920);
    assert.equal((image.y + image.h + outputCamera.y) * outputCamera.z, 1080);
    // Existing overlay coordinates and tldraw positions must land together.
    const overlayScale = SCENE.outputWidth / SCENE.width;
    assert.equal((origin.x + 300 + camera.x) * camera.z * overlayScale, (origin.x + 300 + outputCamera.x) * outputCamera.z);
  }
});

test('portrait, square and ultrawide images stay complete, centred and undistorted', () => {
  for (const [width, height] of [[900, 1600], [1000, 1000], [4000, 1000], [1815, 1100]]) {
    const fitted = fitImageToScene(width, height);
    assert.ok(fitted.w <= SCENE.width && fitted.h <= SCENE.height);
    assert.ok(Math.abs(fitted.w / fitted.h - width / height) < 1e-10);
    assert.equal(fitted.x + fitted.w / 2, SCENE.width / 2);
    assert.equal(fitted.y + fitted.h / 2, SCENE.height / 2);
  }
  for (const size of [[0, 100], [-1, 100], [Infinity, 100], [100, NaN]]) {
    assert.equal(fitImageToScene(...size), null);
  }
});

test('saved camera framing survives different screens and fullscreen preview sizes', () => {
  const logical = { x: -2000, y: -100, z: 1.25 };
  let camera;
  let scale = 0.5;
  const editor = {
    getCamera: () => camera,
    getContainer: () => ({ closest: () => ({ dataset: { sceneScale: String(scale) } }) }),
    setCamera: next => { camera = next; },
  };
  for (const nextScale of [0.35, 0.5, 0.75, 1, 1.5]) {
    scale = nextScale;
    setSceneCamera(editor, logical);
    assert.deepEqual(getSceneCamera(editor), logical);
    // Normalized screen position is independent of preview size.
    assert.ok(Math.abs((2200 + camera.x) * camera.z / scale - 250) < 1e-10);
  }
  editor.getContainer = () => ({ closest: () => null });
  setSceneCamera(editor, logical);
  assert.deepEqual(camera, logical, 'legacy canvas zoom stays unchanged');
});
