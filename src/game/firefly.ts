// The player character: a little round firefly seen from behind, as the camera follows it.
// Its glowing lantern (the tip of the abdomen) faces the camera and lights the corridor.

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

// Shapes in unit coordinates (radius 1, y down), built once.
const ELYTRON = (() => {
  // The left wing cover; the right one is mirrored. Hinged at the top near the midline.
  const p = new Path2D();
  p.moveTo(-0.05, -0.44);
  p.bezierCurveTo(-0.36, -0.49, -0.61, -0.32, -0.63, -0.04);
  p.bezierCurveTo(-0.64, 0.16, -0.46, 0.31, -0.25, 0.27);
  p.bezierCurveTo(-0.11, 0.18, -0.04, -0.1, -0.05, -0.44);
  p.closePath();
  return p;
})();

const LANTERN = (() => {
  const p = new Path2D();
  p.ellipse(0, 0.36, 0.55, 0.5, 0, 0, Math.PI * 2);
  return p;
})();

export function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pose: FireflyPose): void {
  const { t, tilt, air, alpha, glow } = pose;
  const [lr, lg, lb] = FIREFLY_LIGHT;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);

  // Halo around the lantern, drawn upright before the body banks.
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0.4, 0.1, 0, 0.4, 2.6);
  halo.addColorStop(0, `rgba(${lr},${lg},${lb},${0.42 * glow * alpha})`);
  halo.addColorStop(0.3, `rgba(${lr},${lg},${lb},${0.13 * glow * alpha})`);
  halo.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0.4, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = alpha;
  ctx.rotate(tilt * 0.32 + Math.sin(t * 2.1) * 0.04);
  // Rising in a jump tips the body slightly back, so more of the lantern shows.
  ctx.scale(1, 1 - air * 0.06);
  const lean = tilt * 0.05;

  drawWings(ctx, t, air);
  drawLegs(ctx, t);
  drawLantern(ctx, glow);
  drawHead(ctx, t, tilt, lean);

  // Wing covers, spread a little in flight, with a cream rim like a real firefly.
  const spread = 0.13 + Math.sin(t * 9) * 0.015 + air * 0.05;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 0.05, -0.44);
    ctx.rotate(-side * spread);
    ctx.translate(-side * 0.05, 0.44);
    ctx.scale(-side, 1);
    const shell = ctx.createLinearGradient(-0.6, -0.4, -0.1, 0.25);
    shell.addColorStop(0, '#4a3524');
    shell.addColorStop(1, '#1f1610');
    ctx.fillStyle = shell;
    ctx.fill(ELYTRON);
    ctx.save();
    ctx.clip(ELYTRON);
    // Lantern light catching the lower edge.
    const under = ctx.createRadialGradient(0, 0.42, 0, 0, 0.42, 0.7);
    under.addColorStop(0, `rgba(${lr},${lg},${lb},${0.45 * Math.min(1.3, glow)})`);
    under.addColorStop(1, `rgba(${lr},${lg},${lb},0)`);
    ctx.fillStyle = under;
    ctx.fillRect(-0.7, -0.5, 0.7, 0.9);
    // Glossy highlight.
    ctx.fillStyle = 'rgba(255,232,196,0.16)';
    ctx.beginPath();
    ctx.ellipse(-0.4, -0.22, 0.09, 0.2, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#c99d5a';
    ctx.lineWidth = 0.035;
    ctx.stroke(ELYTRON);
    ctx.restore();
  }

  // Bloom over the lantern so it reads as a light, not just a colour.
  ctx.globalCompositeOperation = 'lighter';
  const bloom = ctx.createRadialGradient(0, 0.46, 0, 0, 0.46, 0.75);
  bloom.addColorStop(0, `rgba(255,255,215,${0.4 * glow * alpha})`);
  bloom.addColorStop(1, 'rgba(255,255,215,0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(0, 0.46, 0.75, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Two buzzing membranous wings, drawn as a few ghosted positions for motion blur. */
function drawWings(ctx: CanvasRenderingContext2D, t: number, air: number): void {
  const rate = 42 + air * 18;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const beat = 0.5 + 0.5 * Math.sin(t * rate + k * 0.9);
      const angle = -(0.25 + 0.6 * beat);
      ctx.save();
      ctx.translate(side * 0.2, -0.3);
      ctx.scale(side, 1);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(232,238,255,0.16)';
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.ellipse(0.55, 0, 0.58, 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** Tiny legs tucked under the body, just peeking out at the sides. */
function drawLegs(ctx: CanvasRenderingContext2D, t: number): void {
  ctx.strokeStyle = '#2a1d14';
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 3 + i + side) * 0.03;
      const y0 = -0.12 + i * 0.16;
      ctx.beginPath();
      ctx.moveTo(side * 0.4, y0);
      ctx.quadraticCurveTo(side * 0.66, y0 + 0.02, side * (0.62 + sway), y0 + 0.2);
      ctx.stroke();
    }
  }
}

/** The glowing abdomen, with faint segment bands. */
function drawLantern(ctx: CanvasRenderingContext2D, glow: number): void {
  const g = Math.min(1.25, glow);
  const fill = ctx.createRadialGradient(0, 0.46, 0, 0, 0.4, 0.6);
  fill.addColorStop(0, '#fffde6');
  fill.addColorStop(0.4, mix('#f6f8a8', '#fffde6', g - 1));
  fill.addColorStop(0.8, '#cde35c');
  fill.addColorStop(1, '#93b23a');
  ctx.fillStyle = fill;
  ctx.fill(LANTERN);
  ctx.save();
  ctx.clip(LANTERN);
  ctx.strokeStyle = 'rgba(120,150,40,0.35)';
  ctx.lineWidth = 0.035;
  for (const [y, w] of [
    [0.42, 0.5],
    [0.62, 0.4],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + 0.18, w, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Head, antennae and the orange shield (pronotum) behind it. */
function drawHead(ctx: CanvasRenderingContext2D, t: number, tilt: number, lean: number): void {
  // Antennae, swaying and trailing a little behind lane changes.
  ctx.strokeStyle = '#2a1d14';
  ctx.fillStyle = '#2a1d14';
  ctx.lineWidth = 0.045;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const sway = Math.sin(t * 3.2 + side * 1.3) * 0.05 - tilt * 0.08;
    const tipX = side * 0.36 + sway + lean;
    const tipY = -1.1 + Math.cos(t * 3.2 + side) * 0.03;
    ctx.beginPath();
    ctx.moveTo(side * 0.07 + lean, -0.72);
    ctx.quadraticCurveTo(side * 0.06 + lean, -1.02, tipX, tipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(tipX, tipY, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#24180f';
  ctx.beginPath();
  ctx.ellipse(lean, -0.68, 0.17, 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  const shield = ctx.createLinearGradient(0, -0.7, 0, -0.32);
  shield.addColorStop(0, '#e8875c');
  shield.addColorStop(1, '#b5502f');
  ctx.fillStyle = shield;
  ctx.beginPath();
  ctx.ellipse(lean * 0.6, -0.5, 0.36, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1a12';
  ctx.beginPath();
  ctx.ellipse(lean * 0.6, -0.52, 0.09, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,190,0.22)';
  ctx.beginPath();
  ctx.ellipse(lean * 0.6 - 0.14, -0.58, 0.08, 0.04, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Linear mix of two hex colours (k clamped to 0..1). */
function mix(a: string, b: string, k: number): string {
  const t = Math.max(0, Math.min(1, k));
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
