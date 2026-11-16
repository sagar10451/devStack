export function generateHandDrawnHighlightPath(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  let s = Math.abs(hash) || 1;
  const rand = () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };
  const W = 200, H = 50;
  const m = 4, er = 10, ns = 14, wav = 3.5, rough = 1.8;
  const pts: { x: number; y: number }[] = [];
  // Left rounded end
  pts.push({ x: m + er * 0.4, y: H - m - rough * rand() });
  pts.push({ x: m - er * 0.2 * rand(), y: H * 0.55 + rough * (rand() - 0.5) });
  pts.push({ x: m + er * 0.4, y: m + rough * rand() });
  // Top edge (left→right, wavy)
  for (let i = 1; i <= ns; i++) {
    const t = i / (ns + 1);
    const x = m + er + t * (W - 2 * m - 2 * er);
    const y = m + wav * Math.sin(t * Math.PI * 3.4 + rand() * 5) + rough * (rand() - 0.5);
    pts.push({ x, y: Math.max(1, y) });
  }
  // Right rounded end
  pts.push({ x: W - m - er * 0.4, y: m + rough * rand() });
  pts.push({ x: W - m + er * 0.2 * rand(), y: H * 0.45 + rough * (rand() - 0.5) });
  pts.push({ x: W - m - er * 0.4, y: H - m - rough * rand() });
  // Bottom edge (right→left, wavy — different freq)
  for (let i = ns; i >= 1; i--) {
    const t = i / (ns + 1);
    const x = m + er + t * (W - 2 * m - 2 * er);
    const y = H - m + wav * Math.sin(t * Math.PI * 2.8 + rand() * 5) + rough * (rand() - 0.5);
    pts.push({ x, y: Math.min(H - 1, y) });
  }
  // Smooth closed path via quadratic Bezier through midpoints
  const f = pts[0];
  let d = `M ${f.x.toFixed(1)},${f.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i];
    d += ` Q ${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + c.x) / 2).toFixed(1)},${((p.y + c.y) / 2).toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  d += ` Q ${l.x.toFixed(1)},${l.y.toFixed(1)} ${f.x.toFixed(1)},${f.y.toFixed(1)} Z`;
  return d;
}
