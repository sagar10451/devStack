import type { AnimationStep } from './types';

const overlays = new Set(['Highlight', 'Mask', 'Paint B&W', 'Pointer']);

// Region overlays follow their image's visibility, not their own reveal step.
// Untracked/static and preloaded images are already visible before playback.
export function isShapeVisibleAtStep(steps: AnimationStep[], shapeId: string, currentStep: number) {
  const relevant = steps.filter(step => !overlays.has(step.label) && step.action !== 'none' && (step.shapeIds.includes(shapeId) || step.exitShapeIds?.includes(shapeId)));
  let visible = relevant.length === 0 || relevant.some(step => step.animation === 'none' && (step.action || 'enter') === 'enter' && step.shapeIds.includes(shapeId));
  for (let index = 0; index <= currentStep && index < steps.length; index++) {
    const step = steps[index];
    if (!relevant.includes(step)) continue;
    const action = step.action || 'enter';
    if (action.startsWith('topic') || action === 'logoGlow' || action === 'blink') continue;
    if (action === 'exit' || step.exitShapeIds?.includes(shapeId)) visible = false;
    else visible = true;
  }
  return visible;
}
