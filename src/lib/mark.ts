// The Clanki mark: a Claude-style starburst of 12 rounded, slightly irregular rays.
// Shared by the app logo (SVG) and the runner character (canvas).

export const MARK_COLOR = '#d97757';

/** Ray angle offsets (degrees) and lengths (fraction of the radius), for a hand-drawn feel. */
const JITTER = [0, 4, -3, 2, -4, 3, -2, 4, -3, 1, -2, 3];
const LENGTHS = [1, 0.8, 0.94, 0.76, 0.98, 0.84, 0.9, 0.78, 1, 0.82, 0.92, 0.8];

/** Ray width as a fraction of the radius. */
export const RAY_WIDTH = 0.19;

export interface Ray {
  /** Radians, 0 = pointing up, clockwise. */
  angle: number;
  length: number;
}

export const RAYS: Ray[] = JITTER.map((j, i) => ({
  angle: ((i * 30 + j) * Math.PI) / 180,
  length: LENGTHS[i],
}));

/** Ray end points for a mark of radius r centred at (cx, cy). */
export function rayEnds(cx: number, cy: number, r: number): { x: number; y: number }[] {
  // Leave room for the round caps so the mark stays within r.
  const reach = r * (1 - RAY_WIDTH / 2);
  return RAYS.map(({ angle, length }) => ({
    x: cx + Math.sin(angle) * reach * length,
    y: cy - Math.cos(angle) * reach * length,
  }));
}

/** SVG path data for the rays (stroke it with round caps, width RAY_WIDTH * r). */
export function markPath(cx: number, cy: number, r: number): string {
  return rayEnds(cx, cy, r)
    .map((p) => `M${cx} ${cy}L${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join('');
}
