/** Display-only crossings; the routed points and graph topology remain intact. */
interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }
interface CrossingPath { points: Point[]; owner: number }
interface Segment { path: number; index: number; a: Point; b: Point; length: number; ux: number; uy: number }
interface Hit { distance: number; under: number }
const n = (value: number) => String(Math.round(value * 1000) / 1000);
const xy = (point: Point) => `${n(point.x)} ${n(point.y)}`;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/** One upper path per crossing, with transparent masks on the lower paths. */
export function crossingPaths(paths: CrossingPath[], mode: 'bridge' | 'plain', lineWidth: number, obstacles: Rect[] = []) {
  const data = paths.map(path => path.points.map((p, i) => `${i ? 'L' : 'M'}${xy(p)}`).join(' '));
  const masks: string[][] = paths.map(() => []);
  if (mode === 'plain') return { data, masks };
  const segments: Segment[] = [];
  paths.forEach((path, index) => {
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0.001) segments.push({ path: index, index: i, a, b, length, ux: (b.x - a.x) / length, uy: (b.y - a.y) / length });
    }
  });
  const hits = new Map<Segment, Hit[]>();
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const lower = segments[i], upper = segments[j];
    if (paths[lower.path].owner === paths[upper.path].owner) continue;
    const denominator = cross(upper.ux, upper.uy, lower.ux, lower.uy);
    if (Math.abs(denominator) < 0.001) continue; // Parallel, including shared trunks.
    const dx = lower.a.x - upper.a.x, dy = lower.a.y - upper.a.y;
    const t = cross(dx, dy, lower.ux, lower.uy) / denominator;
    const u = cross(dx, dy, upper.ux, upper.uy) / denominator;
    if (t <= 0.01 || t >= upper.length - 0.01 || u <= 0.01 || u >= lower.length - 0.01) continue;
    const list = hits.get(upper) ?? [];
    list.push({ distance: t, under: lower.path }); hits.set(upper, list);
  }
  const pieces = paths.map(path => path.points.length ? [`M${xy(path.points[0])}`] : []);
  for (const segment of segments) {
    const list = (hits.get(segment) ?? []).sort((a, b) => a.distance - b.distance);
    const at = (distance: number): Point => ({ x: segment.a.x + segment.ux * distance, y: segment.a.y + segment.uy * distance });
    // Merge nearby crossings into one arch, so dense runs cannot produce overlapping arcs.
    const radius = Math.max(6, lineWidth + 2), clusters: Hit[][] = [];
    for (const hit of list) {
      const last = clusters.at(-1);
      if (last && hit.distance - last.at(-1)!.distance < radius * 2 + 2) last.push(hit);
      else clusters.push([hit]);
    }
    for (const cluster of clusters) {
      const first = cluster[0].distance, last = cluster.at(-1)!.distance;
      const r = Math.min(radius, first - 1, segment.length - last - 1);
      if (r < lineWidth / 2 + 1) continue; // No room beside a bend or endpoint.
      const begin = at(first - r), end = at(last + r), rx = (last - first) / 2 + r;
      const rotation = Math.atan2(segment.uy, segment.ux) * 180 / Math.PI;
      let arc = '';
      for (const sweep of [1, 0]) {
        const sign = sweep ? -1 : 1;
        const points = Array.from({ length: 17 }, (_, i) => {
          const angle = Math.PI * i / 16;
          const base = at((first + last) / 2 - rx * Math.cos(angle));
          return { x: base.x - segment.uy * sign * r * Math.sin(angle), y: base.y + segment.ux * sign * r * Math.sin(angle) };
        });
        const pad = lineWidth / 2 + 1;
        if (points.some(p => obstacles.some(box => p.x > box.x - pad && p.x < box.x + box.width + pad && p.y > box.y - pad && p.y < box.y + box.height + pad))) continue;
        arc = `A${n(rx)} ${n(r)} ${n(rotation)} 0 ${sweep} ${xy(end)}`;
        break;
      }
      if (!arc) continue;
      pieces[segment.path].push(`L${xy(begin)} ${arc}`);
      // Mask just the arc's stroke on the underpass, preserving its centre and transparency.
      for (const under of new Set(cluster.map(hit => hit.under))) masks[under].push(`M${xy(begin)} ${arc}`);
    }
    pieces[segment.path].push(`L${xy(segment.b)}`);
  }
  return { data: pieces.map(parts => parts.join(' ')), masks };
}
