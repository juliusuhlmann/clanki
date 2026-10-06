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
  /** Lantern brightness, ~1 normally, higher while boosted. */
  glow: number;
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

/** A radial gradient that shades a circle like a sphere lit from the upper left. */
function sphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, lit: string, mid: string, rim: string): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, lit);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, rim);
  return g;
}

export function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: FireflyPose): void {
  const { t, tilt, air, alpha, glow } = pose;
  const [lr, lg, lb] = FIREFLY_LIGHT;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);

  // Soft halo around the belly.
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0.25, 0.1, 0, 0.25, 2.4);
  halo.addColorStop(0, `rgba(${lr},${lg},${lb},${0.38 * glow * alpha})`);
  halo.addColorStop(0.3, `rgba(${lr},${lg},${lb},${0.11 * glow * alpha})`);
  halo.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0.25, 2.4, 0, Math.PI * 2);
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

  // Body: shaded as a sphere lit from the upper left, darker toward the rim.
  ctx.fillStyle = sphere(ctx, 0, 0, BODY_R, '#8a6450', BODY_COLOR, '#24170f');
  ctx.fill(BODY);

  ctx.save();
  ctx.clip(BODY);
  // The lantern fills most of the body; only a dark cap remains at the top, under the head.
  // Brightest in the middle, deepening toward the edge, so it reads as a glowing ball.
  const light = ctx.createRadialGradient(-0.06, 0.16, 0, 0, 0.04, BODY_R * 1.02);
  light.addColorStop(0, '#fffef0');
  light.addColorStop(0.45, Math.min(1.25, glow) > 1.05 ? '#fffbd0' : '#f8f4a4');
  light.addColorStop(0.8, '#d6e86c');
  light.addColorStop(1, '#a3bf45');
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 0.32, 0.8, 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft shadow where the head sits on the body.
  const contact = ctx.createRadialGradient(0, HEAD_Y + HEAD_R * 0.75, 0, 0, HEAD_Y + HEAD_R * 0.75, 0.42);
  contact.addColorStop(0, 'rgba(20,12,8,0.45)');
  contact.addColorStop(1, 'rgba(20,12,8,0)');
  ctx.fillStyle = contact;
  ctx.fillRect(-0.6, -0.6, 1.2, 0.6);
  ctx.restore();

  // Head: another small sphere, with lantern light bouncing onto its underside.
  ctx.fillStyle = sphere(ctx, 0, HEAD_Y, HEAD_R, '#9a725c', '#523729', '#22160f');
  ctx.beginPath();
  ctx.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const bounce = ctx.createLinearGradient(0, HEAD_Y + HEAD_R * 0.2, 0, HEAD_Y + HEAD_R);
  bounce.addColorStop(0, 'rgba(230,240,130,0)');
  bounce.addColorStop(1, 'rgba(230,240,130,0.3)');
  ctx.fillStyle = bounce;
  ctx.fillRect(-HEAD_R, HEAD_Y, HEAD_R * 2, HEAD_R);
  ctx.restore();

  // Glossy highlights on the head and on the body's dark cap.
  for (const [hx, hy, hr] of [
    [-0.13, HEAD_Y - 0.15, 0.09],
    [-0.36, -0.3, 0.07],
  ] as const) {
    const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 1.6);
    spec.addColorStop(0, 'rgba(255,240,220,0.55)');
    spec.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

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
