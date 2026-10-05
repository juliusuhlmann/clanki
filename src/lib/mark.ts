// The Clanki mark: a Claude-style starburst of 12 tapered, slightly irregular rays.
// Built as polygon outlines so the SVG logo, the canvas character and the
// generated app icons are exactly the same shape.

export const MARK_COLOR = '#d97757';

/** Ray angle offsets (degrees) and lengths (fraction of the radius), for a hand-drawn feel. */
const JITTER = [0, 5, -3, 2, -5, 3, -2, 4, -4, 1, -2, 3];
const LENGTHS = [1, 0.74, 0.93, 0.7, 0.97, 0.8, 0.9, 0.72, 1, 0.78, 0.92, 0.74];

/** Half-width of a ray at the centre and at its rounded tip, as fractions of the radius. */
const BASE_HALF = 0.105;
const TIP_HALF = 0.062;
const TIP_STEPS = 8;

type Point = { x: number; y: number };

/** One closed outline per ray, for a mark of radius r centred at (cx, cy). */
export function rayOutlines(cx: number, cy: number, r: number): Point[][] {
  return JITTER.map((jitter, i) => {
    const angle = ((i * 30 + jitter) * Math.PI) / 180;
    const ux = Math.sin(angle);
    const uy = -Math.cos(angle);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const base = BASE_HALF * r;
    const tip = TIP_HALF * r;
    const reach = LENGTHS[i] * r - tip; // centre of the tip's round cap
    const tx = cx + ux * reach;
    const ty = cy + uy * reach;

    const points: Point[] = [{ x: cx + nx * base, y: cy + ny * base }];
    // Round cap: half circle from the right side, over the tip, to the left side.
    for (let s = 0; s <= TIP_STEPS; s++) {
      const a = (s / TIP_STEPS) * Math.PI;
      const c = Math.cos(a);
      const d = Math.sin(a);
      points.push({ x: tx + nx * tip * c + ux * tip * d, y: ty + ny * tip * c + uy * tip * d });
    }
    points.push({ x: cx - nx * base, y: cy - ny * base });
    return points;
  });
}

/** SVG / Path2D path data for the mark (fill it with MARK_COLOR). */
export function markPath(cx: number, cy: number, r: number): string {
  return rayOutlines(cx, cy, r)
    .map((pts) => 'M' + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('L') + 'Z')
    .join('');
}
