// The player character: a small round firefly seen from behind, as the camera follows it.
// Its glowing belly faces the camera and lights the corridor. Now and then it glances back.

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
  /** 0..1, how far it has turned its head to look back at the camera. */
  look: number;
  /** Which shoulder it looks over: -1 left, 1 right. */
  lookSide: -1 | 1;
  /** Squeezed eyes after a hit. */
  hurt: boolean;
}

/** The lantern's light, for anything the firefly illuminates. */
export const FIREFLY_LIGHT: [number, number, number] = [228, 240, 130];
export const FIREFLY_COLOR = '#e6f07a';

const BODY_R = 0.6;
const HEAD_Y = -0.66;
const HEAD_R = 0.37;

const BODY = (() => {
  const p = new Path2D();
  p.arc(0, 0, BODY_R, 0, Math.PI * 2);
  return p;
})();

const HEAD = (() => {
  const p = new Path2D();
  p.arc(0, HEAD_Y, HEAD_R, 0, Math.PI * 2);
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
  // A gentle breathing squash keeps it feeling alive.
  const breathe = Math.sin(t * 2.6) * 0.025;
  ctx.scale(1 + breathe, 1 - breathe);

  drawWings(ctx, t, air);
  drawBody(ctx, glow);
  drawHead(ctx, pose);

  // Bloom over the belly so it reads as a light, not just a colour.
  ctx.globalCompositeOperation = 'lighter';
  const bloom = ctx.createRadialGradient(0, 0.3, 0, 0, 0.3, 0.6);
  bloom.addColorStop(0, `rgba(255,255,220,${0.32 * glow * alpha})`);
  bloom.addColorStop(1, 'rgba(255,255,220,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0.3, 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Two small rounded wings, buzzing; a couple of ghosted positions give a soft motion blur. */
function drawWings(ctx: CanvasRenderingContext2D, t: number, air: number): void {
  const rate = 34 + air * 14;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const beat = 0.5 + 0.5 * Math.sin(t * rate + k * 1.3);
      ctx.save();
      ctx.translate(side * 0.22, -0.36);
      ctx.scale(side, 1);
      ctx.rotate(-(0.35 + 0.7 * beat));
      ctx.fillStyle = 'rgba(236,244,255,0.32)';
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.025;
      // A teardrop: narrow at the shoulder, round at the tip.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(0.22, -0.28, 0.8, -0.3, 0.84, 0);
      ctx.bezierCurveTo(0.8, 0.22, 0.22, 0.2, 0, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** One round body: soft brown on top, the glowing lantern below. */
function drawBody(ctx: CanvasRenderingContext2D, glow: number): void {
  const fur = ctx.createRadialGradient(-0.18, -0.3, 0.05, 0, 0, BODY_R);
  fur.addColorStop(0, '#7a5440');
  fur.addColorStop(1, '#3e2a20');
  ctx.fillStyle = fur;
  ctx.fill(BODY);

  ctx.save();
  ctx.clip(BODY);
  // The lantern: a dome of light filling the lower body.
  const g = Math.min(1.25, glow);
  const light = ctx.createRadialGradient(0, 0.42, 0, 0, 0.3, 0.62);
  light.addColorStop(0, '#fffef0');
  light.addColorStop(0.45, g > 1.05 ? '#fffbd0' : '#fbf6a8');
  light.addColorStop(0.85, '#e2ef7e');
  light.addColorStop(1, '#c4dc5c');
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, 0.32, 0.7, 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // One soft segment line, curving like a smile.
  ctx.strokeStyle = 'rgba(150,170,60,0.28)';
  ctx.lineWidth = 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.42, 0.34);
  ctx.quadraticCurveTo(0, 0.52, 0.42, 0.34);
  ctx.stroke();
  // Warm light bleeding up onto the brown.
  const bleed = ctx.createLinearGradient(0, -0.15, 0, 0.1);
  bleed.addColorStop(0, 'rgba(240,230,140,0)');
  bleed.addColorStop(1, 'rgba(240,230,140,0.25)');
  ctx.fillStyle = bleed;
  ctx.fillRect(-0.7, -0.4, 1.4, 0.55);
  ctx.restore();

  // Glossy highlight on the back.
  ctx.fillStyle = 'rgba(255,236,210,0.16)';
  ctx.beginPath();
  ctx.ellipse(-0.24, -0.3, 0.15, 0.08, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Round head with springy antennae; when it looks back, its face turns into view. */
function drawHead(ctx: CanvasRenderingContext2D, pose: FireflyPose): void {
  const { t, tilt, look, lookSide, hurt } = pose;
  const [lr, lg, lb] = FIREFLY_LIGHT;
  // The head turns a little ahead of the face, so the turn reads even at small sizes.
  const turn = lookSide * look * 0.09;

  // Antennae with glowing tips, bobbing a beat behind the body.
  ctx.strokeStyle = '#3e2a20';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  const tips: [number, number][] = [];
  for (const side of [-1, 1]) {
    const sway = Math.sin(t * 3.4 + side) * 0.05 - tilt * 0.1 + turn * 1.5;
    const tipX = side * 0.34 + sway;
    const tipY = HEAD_Y - 0.66 + Math.cos(t * 3.4 + side) * 0.03;
    ctx.beginPath();
    ctx.moveTo(side * 0.12 + turn, HEAD_Y - 0.3);
    ctx.quadraticCurveTo(side * 0.1 + turn, HEAD_Y - 0.6, tipX, tipY);
    ctx.stroke();
    tips.push([tipX, tipY]);
  }

  const skin = ctx.createRadialGradient(-0.12 + turn, HEAD_Y - 0.14, 0.03, turn * 0.5, HEAD_Y, HEAD_R);
  skin.addColorStop(0, '#8a604a');
  skin.addColorStop(1, '#4a3226');
  ctx.save();
  ctx.translate(turn * 0.4, 0);
  ctx.fillStyle = skin;
  ctx.fill(HEAD);
  // Lantern light on the underside of the head.
  ctx.save();
  ctx.clip(HEAD);
  const under = ctx.createLinearGradient(0, HEAD_Y + 0.1, 0, HEAD_Y + HEAD_R);
  under.addColorStop(0, 'rgba(240,230,140,0)');
  under.addColorStop(1, 'rgba(240,230,140,0.22)');
  ctx.fillStyle = under;
  ctx.fillRect(-0.5, HEAD_Y, 1, 0.5);
  if (look > 0.01) drawFace(ctx, look, lookSide, hurt);
  ctx.restore();
  ctx.restore();

  // Glowing antenna tips.
  for (const [tx, ty] of tips) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 0.2);
    g.addColorStop(0, `rgba(${lr},${lg},${lb},0.55)`);
    g.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tx, ty, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#f6fbc4';
    ctx.beginPath();
    ctx.arc(tx, ty, 0.065, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Big shiny eyes and rosy cheeks, sliding in from one side as the head turns (clipped to the head). */
function drawFace(ctx: CanvasRenderingContext2D, look: number, side: -1 | 1, hurt: boolean): void {
  const e = look * look * (3 - 2 * look);
  const shift = side * (1 - e) * 0.42;
  const eyeY = HEAD_Y + 0.04;
  for (const ex of [-0.15, 0.15]) {
    const cx = ex + shift;
    if (hurt) {
      // Squeezed shut: > <
      ctx.strokeStyle = '#1c120d';
      ctx.lineWidth = 0.045;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const d = ex < 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx - d * 0.06, eyeY - 0.07);
      ctx.lineTo(cx + d * 0.05, eyeY);
      ctx.lineTo(cx - d * 0.06, eyeY + 0.07);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#1c120d';
    ctx.beginPath();
    ctx.ellipse(cx, eyeY, 0.085, 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 0.028, eyeY - 0.045, 0.032, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 0.03, eyeY + 0.035, 0.015, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cheeks and a tiny smile.
  ctx.fillStyle = `rgba(240,130,110,${0.55 * e})`;
  for (const cx of [-0.25, 0.25]) {
    ctx.beginPath();
    ctx.ellipse(cx + shift, eyeY + 0.11, 0.065, 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#1c120d';
  ctx.lineWidth = 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (hurt) {
    ctx.arc(shift, eyeY + 0.17, 0.035, Math.PI * 1.1, Math.PI * 1.9);
  } else {
    ctx.arc(shift, eyeY + 0.1, 0.045, Math.PI * 0.2, Math.PI * 0.8);
  }
  ctx.stroke();
}
