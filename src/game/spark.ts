// The player character: a glowing orange spark with eyes.

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

function starPath(ctx: CanvasRenderingContext2D, r: number): void {
  // Four long rays and four short ones.
  const points = 8;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const outer = i % 4 === 0 ? 1 : 0.68;
    const radius = i % 2 === 0 ? r * outer : r * 0.36;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: SparkPose): void {
  const { t, tilt, air, alpha } = pose;

  ctx.save();
  ctx.translate(x, y);

  // Outer glow.
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.4);
  glow.addColorStop(0, `rgba(255,150,90,${0.55 * alpha})`);
  glow.addColorStop(0.4, `rgba(217,119,87,${0.22 * alpha})`);
  glow.addColorStop(1, 'rgba(217,119,87,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = alpha;
  ctx.rotate(tilt * 0.35 + Math.sin(t * 2.2) * 0.06);
  ctx.scale(1 - air * 0.08, 1 + air * 0.12);

  // Body: slowly spinning star with a soft gradient and rounded tips.
  ctx.save();
  ctx.rotate(Math.sin(t * 1.3) * 0.12);
  const body = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#ffc6a6');
  body.addColorStop(0.45, '#e8875f');
  body.addColorStop(1, '#c4613f');
  starPath(ctx, r);
  ctx.fillStyle = body;
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = '#d97757';
  ctx.stroke();
  ctx.fill();
  ctx.restore();

  // Eyes: blink every few seconds, look slightly toward the lean.
  const blink = (t % 3.7) < 0.12 ? 0.12 : 1;
  const eyeY = -r * 0.04;
  const eyeX = r * 0.16;
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
