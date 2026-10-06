// The player character: a small round firefly seen from behind, as the camera follows it.
// Kept deliberately simple: flat shapes, with the glowing belly facing the camera.

export interface FireflyPose {
  /** Seconds, drives idle animation. */
  t: number;
  /** -1..1, bank while changing lanes. */
  tilt: number;
  /** 0..1, how high in a jump. */
  air: number;
  /** 0..1, flicker while invulnerable. */
  alpha: number;
  /** Lantern brightness, ~1 normally, flaring briefly after a letter. */
  glow: number;
  /** Size of the outer halo (1 = in-game; smaller for UI icons). */
  halo?: number;
}

/** The lantern's light, for anything the firefly illuminates. */
export const FIREFLY_LIGHT: [number, number, number] = [228, 240, 130];
export const FIREFLY_COLOR = '#e6f07a';

const BODY_COLOR = '#4a3226';
const BODY_R = 0.6;
const HEAD_Y = -0.66;
const HEAD_R = 0.36;

const BODY = (() => {
  const p = new Path2D();
  p.arc(0, 0, BODY_R, 0, Math.PI * 2);
  return p;
})();

export function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: FireflyPose): void {
  const { t, tilt, air, alpha, glow } = pose;
  const [lr, lg, lb] = FIREFLY_LIGHT;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);

  // Soft halo around the belly.
  ctx.globalCompositeOperation = 'lighter';
  const haloR = 2.4 * (pose.halo ?? 1);
  const halo = ctx.createRadialGradient(0, 0.25, 0.1, 0, 0.25, haloR);
  halo.addColorStop(0, `rgba(${lr},${lg},${lb},${0.38 * glow * alpha})`);
  halo.addColorStop(0.3, `rgba(${lr},${lg},${lb},${0.11 * glow * alpha})`);
  halo.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0.25, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = alpha;
  ctx.rotate(tilt * 0.3 + Math.sin(t * 2.1) * 0.05);

  // Wings: two flat translucent teardrops, buzzing.
  const beat = 0.5 + 0.5 * Math.sin(t * (34 + air * 14));
  ctx.fillStyle = 'rgba(236,244,255,0.4)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 0.22, -0.36);
    ctx.scale(side, 1);
    ctx.rotate(-(0.35 + 0.7 * beat));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.22, -0.28, 0.8, -0.3, 0.84, 0);
    ctx.bezierCurveTo(0.8, 0.22, 0.22, 0.2, 0, 0);
    ctx.fill();
    ctx.restore();
  }

  // Antennae with glowing tips.
  ctx.strokeStyle = '#7a5644';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  const tips: [number, number][] = [];
  for (const side of [-1, 1]) {
    const tipX = side * 0.34 + Math.sin(t * 3.4 + side) * 0.04 - tilt * 0.1;
    const tipY = HEAD_Y - 0.64;
    ctx.beginPath();
    ctx.moveTo(side * 0.12, HEAD_Y - 0.3);
    ctx.quadraticCurveTo(side * 0.1, HEAD_Y - 0.58, tipX, tipY);
    ctx.stroke();
    tips.push([tipX, tipY]);
  }

  // Body and head: flat circles.
  ctx.fillStyle = BODY_COLOR;
  ctx.fill(BODY);
  ctx.beginPath();
  ctx.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
  ctx.fill();

  // The belly lantern: the lower part of the body, lit.
  ctx.save();
  ctx.clip(BODY);
  // Most of the body glows; only a dark cap remains at the top, under the head.
  const light = ctx.createRadialGradient(0, 0.25, 0, 0, 0.15, 0.68);
  light.addColorStop(0, '#fffef0');
  light.addColorStop(0.6, Math.min(1.25, glow) > 1.05 ? '#fffbd0' : '#f8f4a4');
  light.addColorStop(1, '#d8ea72');
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 0.32, 0.8, 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Glow on the belly and the antenna tips.
  ctx.globalCompositeOperation = 'lighter';
  const bloom = ctx.createRadialGradient(0, 0.18, 0, 0, 0.18, 0.7);
  bloom.addColorStop(0, `rgba(255,255,220,${0.3 * glow * alpha})`);
  bloom.addColorStop(1, 'rgba(255,255,220,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0.18, 0.7, 0, Math.PI * 2);
  ctx.fill();
  for (const [tx, ty] of tips) {
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 0.18);
    g.addColorStop(0, `rgba(${lr},${lg},${lb},0.5)`);
    g.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#f6fbc4';
  for (const [tx, ty] of tips) {
    ctx.beginPath();
    ctx.arc(tx, ty, 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
