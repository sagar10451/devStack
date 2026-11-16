export const SWIPE_SECONDS = .8;
export const SWIPE_GLOW_SECONDS = 1;
type Point = { x: number; y: number };

function bezierProgress(progress: number, x1: number, y1: number, x2: number, y2: number) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 32; i++) {
    const t = (lo + hi) / 2;
    if (sample(t, x1, x2) < progress) lo = t; else hi = t;
  }
  return sample((lo + hi) / 2, y1, y2);
}

// Same curve as .reveal-shown: cubic-bezier(0.4, 0, 0.2, 1).
export function swipeProgressAt(elapsed: number) {
  return bezierProgress(elapsed / SWIPE_SECONDS, .4, 0, .2, 1);
}

function clipRight(points: readonly Point[], x: number): Point[] {
  const clipped: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aIn = a.x >= x, bIn = b.x >= x;
    if (aIn !== bIn) clipped.push({ x, y: a.y + (x - a.x) / (b.x - a.x) * (b.y - a.y) });
    if (bIn) clipped.push(b);
  }
  return clipped;
}

export function swipeRevealAt(points: readonly Point[], elapsed: number) {
  const progress = swipeProgressAt(elapsed);
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const front = minX + (maxX - minX) * progress;
  const remaining = progress === 0 ? points : progress === 1 ? [] : clipRight(points, front);
  const maskClip = remaining.length < 3 ? 'polygon(0% 0%, 0% 0%, 0% 0%)' : `polygon(${remaining.map(p => `${p.x * 100}% ${p.y * 100}%`).join(', ')})`;
  // Same one-second ease-out envelope as reveal-glow-pulse. Keep glow on a
  // separate outline so its filter never interferes with backdrop grayscale.
  const glow = elapsed < 0 ? 0 : 1 - bezierProgress(elapsed / SWIPE_GLOW_SECONDS, 0, 0, .58, 1);
  return { progress, front, maskClip, glow };
}
