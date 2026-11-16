import { swipeRevealAt } from './swipeReveal';

export default function FreehandSwipeMask({ path, elapsed, left, top, width, height, stepId, regionId, imageShapeId, zIndex = 20, frostScale = 1, className }: {
  path: { x: number; y: number }[]; elapsed: number;
  left: number; top: number; width: number; height: number;
  stepId?: string; regionId?: string; zIndex?: number;
  frostScale?: number; className?: string;
  imageShapeId?: string;
}) {
  const { progress, front, maskClip } = swipeRevealAt(path, elapsed);
  const style = { position: 'absolute' as const, left, top, width, height, pointerEvents: 'none' as const, zIndex };
  if (progress >= 1) return null;
  const edge = front * width;
  const outline = `polygon(${path.map(p => `${p.x * 100}% ${p.y * 100}%`).join(', ')})`;
  const frost = `grayscale(1) blur(${3 * frostScale}px)`;
  return <>
    <div className={className} data-mask-image={imageShapeId} data-region-id={regionId} data-overlay-step={stepId} style={{ ...style, background: 'rgba(255,255,255,0.1)', backdropFilter: frost, WebkitBackdropFilter: frost, clipPath: maskClip }} />
    {progress > 0 && <div data-overlay-step={stepId} style={{
      ...style,
      clipPath: outline,
      opacity: Math.min(1, progress / .08, (1 - progress) / .12),
      background: `linear-gradient(90deg, transparent ${edge - 14}px, rgba(255,213,128,0.15) ${edge - 7}px, rgba(255,226,166,0.65) ${edge - 2}px, rgba(255,255,246,0.95) ${edge}px, rgba(255,226,166,0.65) ${edge + 2}px, rgba(255,213,128,0.15) ${edge + 7}px, transparent ${edge + 14}px)`,
    }} />}
  </>;
}
