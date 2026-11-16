import type { Editor } from 'tldraw';

// Keep saved guides in their original coordinates; scale the complete guide
// to the output frame instead of resizing shapes or changing saved cameras.
export const SCENE = { width: 1600, height: 900, outputWidth: 1920, outputHeight: 1080 };

export type SceneCamera = { x: number; y: number; z: number };
export type SceneOrigin = { x: number; y: number };

export function getSceneOutputCamera(camera: SceneCamera): SceneCamera {
  return { ...camera, z: camera.z * SCENE.outputWidth / SCENE.width };
}

export function clampGuideIndex(index: number, count: number) {
  return Math.max(0, Math.min(Number.isFinite(index) ? Math.floor(index) : 0, count - 1));
}

export function nextSceneOrigin(origins: readonly SceneOrigin[]): SceneOrigin {
  if (origins.length === 0) return { x: 0, y: 0 };
  // Put new scenes beyond every existing scene's right edge, even if those
  // scenes have been dragged or overlap. Never move a saved scene.
  return { x: Math.max(...origins.map(origin => origin.x + SCENE.width)) + 80, y: origins[0].y };
}

export function resolveSceneGuides(count: number, saved: readonly SceneOrigin[] = []) {
  const origins = saved.slice(0, count);
  while (origins.length < count) origins.push(nextSceneOrigin(origins));
  return origins;
}

export function fitImageToScene(width: number, height: number, origin = { x: 0, y: 0 }) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return null;
  const scale = Math.min(SCENE.width / width, SCENE.height / height);
  const w = width * scale;
  const h = height * scale;
  return { x: origin.x + (SCENE.width - w) / 2, y: origin.y + (SCENE.height - h) / 2, w, h };
}

// tldraw stays at its actual displayed size, so drawing, selection and overlays
// continue using real screen coordinates. Only saved camera zoom is normalized.
export function getSceneScale(editor: Editor): number {
  return Number(editor.getContainer().closest<HTMLElement>('[data-scene-scale]')?.dataset.sceneScale) || 1;
}

export function getSceneCamera(editor: Editor): SceneCamera {
  const { x, y, z } = editor.getCamera();
  return { x, y, z: z / getSceneScale(editor) };
}

export function setSceneCamera(editor: Editor, camera: SceneCamera, options?: Parameters<Editor['setCamera']>[1]) {
  return editor.setCamera({ ...camera, z: camera.z * getSceneScale(editor) }, options);
}
