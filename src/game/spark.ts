// The player character: the Claude-style starburst with a glow and eyes.

import { MARK_COLOR, RAY_WIDTH, rayEnds } from '../lib/mark';

export interface SparkPose {
  /** Seconds, drives idle animation. */
  t: number;
  /** -1..1, lean while changing lanes. */
  tilt: number;
  /** 0..1, how high in a jump (for stretch). */
  air: number;
  /** 0..1, flicker while invulnerable. */
  alpha: number;
}

function strokeRays(ctx: CanvasRenderingContext2D, r: number, width: number): void {
  ctx.beginPath();
  for (const p of rayEnds(0, 0, r)) {
    ctx.moveTo(0, 0);
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: SparkPose): void {
  const { t, tilt, air, alpha } = pose;

  ctx.save();
  ctx.translate(x, y);

  // Outer glow.
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
  glow.addColorStop(0, `rgba(255,150,90,${0.3 * alpha})`);
  glow.addColorStop(0.4, `rgba(217,119,87,${0.12 * alpha})`);
  glow.addColorStop(1, 'rgba(217,119,87,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = alpha;
  ctx.rotate(tilt * 0.35 + Math.sin(t * 2.2) * 0.05);
  ctx.scale(1 - air * 0.08, 1 + air * 0.12);

  // Body: the flat starburst, like the logo, swaying gently.
  ctx.save();
  ctx.rotate(Math.sin(t * 1.4) * 0.12);
  ctx.lineCap = 'round';
  ctx.strokeStyle = MARK_COLOR;
  strokeRays(ctx, r, r * RAY_WIDTH);
  ctx.restore();

  const blink = t % 3.7 < 0.12 ? 0.12 : 1;
  const eyeY = -r * 0.02;
  const eyeX = r * 0.15;
  const look = tilt * r * 0.04;
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#fffaf5';
    ctx.beginPath();
    ctx.ellipse(side * eyeX + look, eyeY, r * 0.1, r * 0.13 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink === 1) {
      ctx.fillStyle = '#2a1712';
      ctx.beginPath();
      ctx.ellipse(side * eyeX + look * 2, eyeY - r * 0.02, r * 0.055, r * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(side * eyeX + look * 2 - r * 0.02, eyeY - r * 0.06, r * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
