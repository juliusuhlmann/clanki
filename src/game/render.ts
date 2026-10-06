// Draws the library corridor, obstacles, the firefly and the HUD on a 2D canvas.

import { HOVER_Y, LANE_X, type Game, type Letter, type Obstacle } from './engine';
import { createRng, ladderLine, WALL_X } from './spawner';
import { drawFirefly, FIREFLY_LIGHT } from './firefly';
import { BOOK_COLORS, makeLetterSprite, makeShelfTextures, makeVignette } from './textures';

// Camera and corridor dimensions, in world units.
const CAM_Y = 2.1;
const CAM_BACK = 3.2;
const CAM_FOLLOW = 0.85; // how far the camera follows the firefly sideways (1 = fully)
const NEAR = -2.6;
const FAR = 46;
const SHELF_H = 3.6; // one bookshelf tier; walls are two tiers high
const CEIL_Y = SHELF_H * 2;
const CARPET_X = 1.75;
const SEG = 2.4; // one bookshelf section
const PLANK = 1.0;
const BEAM_GAP = 4.8;
const LAMP_GAP = 9.6;

const FOG: [number, number, number] = [30, 19, 12];
const FOG_CSS = `rgb(${FOG.join(',')})`;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  gold: boolean;
}

interface Projected {
  x: number;
  y: number;
  /** Pixels per world unit at this depth. */
  s: number;
}

function fogAt(z: number): number {
  if (z <= 6) return 0;
  return Math.min(1, Math.pow((z - 6) / (FAR - 6), 1.15));
}

/**
 * Mixes a colour toward the fog colour and returns a CSS string. `light` brightens (or darkens,
 * if negative); `glow` tints it toward the firefly's light.
 */
function fogged(hex: string, fog: number, light = 0, glow = 0): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number, f: number, l: number) => {
    let lit = light >= 0 ? v + (255 - v) * light : v * (1 + light);
    lit += (l - lit) * glow;
    return Math.round(lit * (1 - fog) + f * fog);
  };
  return `rgb(${ch((n >> 16) & 255, FOG[0], FIREFLY_LIGHT[0])},${ch((n >> 8) & 255, FOG[1], FIREFLY_LIGHT[1])},${ch(n & 255, FOG[2], FIREFLY_LIGHT[2])})`;
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export interface HudInfo {
  /** Controls hint shown at the start of a run (null to hide). */
  hint: string | null;
  hintAlpha: number;
  showHud: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private kx = 1;
  private ky = 1;
  private cx = 0;
  private hy = 0;
  private t = 0;
  /** Camera's sideways position; follows the firefly so lane changes shift the perspective. */
  private camX = 0;
  /** The firefly's position and lantern brightness this frame, for lighting the scene. */
  private lightX = 0;
  private lightY = HOVER_Y;
  private glow = 1;

  private shelves = makeShelfTextures(6);
  private letterSprites = new Map<string, HTMLCanvasElement>();
  private vignette: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private dust: { x: number; y: number; r: number; speed: number; phase: number }[] = [];
  private trailTimer = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const rng = createRng(3);
    for (let i = 0; i < 45; i++) {
      this.dust.push({ x: rng(), y: rng(), r: 0.6 + rng() * 1.6, speed: 0.004 + rng() * 0.012, phase: rng() * 6.28 });
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fit the corridor to the width in portrait, to the height in landscape.
    this.kx = Math.min(cssW * 0.75, cssH * 0.85);
    this.ky = cssH / cssW > 1.3 ? this.kx * 1.25 : this.kx;
    this.cx = cssW / 2;
    this.hy = cssH * 0.84 - (CAM_Y * this.ky) / CAM_BACK;
    this.vignette = makeVignette(cssW, cssH);
  }

  private p(x: number, y: number, z: number): Projected {
    const d = Math.max(0.05, z + CAM_BACK);
    return { x: this.cx + ((x - this.camX) * this.kx) / d, y: this.hy + ((CAM_Y - y) * this.ky) / d, s: (this.kx + this.ky) / 2 / d };
  }

  private quad(a: Projected, b: Projected, c: Projected, d: Projected, fill: string | CanvasGradient): void {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }

  /** Visual-only effect when a letter is collected. */
  burst(x: number, y: number, z: number): void {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * 1.6,
        vy: Math.sin(a) * 1.6 + 0.6,
        vz: 0,
        life: 0.55,
        maxLife: 0.55,
        size: 0.06,
        gold: true,
      });
    }
  }

  render(game: Game, dt: number, hud: HudInfo): void {
    this.t += dt;
    // Follow the firefly most of the way, slightly lagging, like other lane runners.
    this.camX += (game.x * CAM_FOLLOW - this.camX) * Math.min(1, dt * 9);
    this.lightX = game.x;
    this.lightY = HOVER_Y + game.jumpY;
    // A slow breathing pulse; letters make the lantern flare.
    this.glow = 0.9 + 0.1 * Math.sin(this.t * 2.6) + game.boost * 0.35;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    this.drawBackground();
    this.drawCeiling(game.distance);
    this.drawFloor(game.distance);
    this.drawLightPools(game.distance);
    this.drawFireflyFloorLight();
    this.drawShelves(game.distance, -1);
    this.drawShelves(game.distance, 1);
    this.drawFireflyWallLight(-1);
    this.drawFireflyWallLight(1);
    this.updateParticles(game, dt);
    this.drawObjects(game);
    this.drawDust(dt);
    if (game.boost > 0) this.drawSpeedLines(game.boost);

    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, this.w, this.h);
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(224,80,70,${game.flash * 0.35})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (hud.showHud) this.drawHud(game);
    if (hud.hint && hud.hintAlpha > 0) this.drawHint(hud.hint, hud.hintAlpha);
  }

  // ---------- Structure ----------

  private drawBackground(): void {
    const ctx = this.ctx;
    ctx.fillStyle = FOG_CSS;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawCeiling(distance: number): void {
    const near = this.p(0, CEIL_Y, NEAR);
    const far = this.p(0, CEIL_Y, FAR);
    const g = this.ctx.createLinearGradient(0, near.y, 0, far.y);
    g.addColorStop(0, '#120a06');
    g.addColorStop(1, FOG_CSS);
    this.quad(this.p(-WALL_X, CEIL_Y, NEAR), this.p(WALL_X, CEIL_Y, NEAR), this.p(WALL_X, CEIL_Y, FAR), this.p(-WALL_X, CEIL_Y, FAR), g);

    // Wooden beams across the ceiling, far to near.
    const first = Math.ceil((distance + NEAR) / BEAM_GAP);
    const last = Math.floor((distance + FAR) / BEAM_GAP);
    for (let k = last; k >= first; k--) {
      const z = k * BEAM_GAP - distance;
      const z1 = z + 0.5;
      if (z < NEAR + 0.4) continue;
      const f = fogAt(z);
      this.quad(this.p(-WALL_X, CEIL_Y, z1), this.p(WALL_X, CEIL_Y, z1), this.p(WALL_X, CEIL_Y - 0.3, z1), this.p(-WALL_X, CEIL_Y - 0.3, z1), fogged('#22150c', f));
      this.quad(this.p(-WALL_X, CEIL_Y - 0.3, z), this.p(WALL_X, CEIL_Y - 0.3, z), this.p(WALL_X, CEIL_Y - 0.3, z1), this.p(-WALL_X, CEIL_Y - 0.3, z1), fogged('#3a2414', f));
      this.quad(this.p(-WALL_X, CEIL_Y, z), this.p(WALL_X, CEIL_Y, z), this.p(WALL_X, CEIL_Y - 0.3, z), this.p(-WALL_X, CEIL_Y - 0.3, z), fogged('#4a2e19', f));
    }
  }

  private drawFloor(distance: number): void {
    const ctx = this.ctx;
    const nearY = this.p(0, 0, NEAR).y;
    const farY = this.p(0, 0, FAR).y;

    // Wooden floor.
    const wood = ctx.createLinearGradient(0, farY, 0, Math.min(nearY, this.h * 1.5));
    wood.addColorStop(0, FOG_CSS);
    wood.addColorStop(0.35, '#3d2716');
    wood.addColorStop(1, '#6b4728');
    this.quad(this.p(-WALL_X, 0, NEAR), this.p(WALL_X, 0, NEAR), this.p(WALL_X, 0, FAR), this.p(-WALL_X, 0, FAR), wood);

    // Plank seams across the floor (outside the carpet), scrolling with distance.
    ctx.lineWidth = 1;
    const first = Math.ceil((distance + NEAR) / PLANK);
    const last = Math.floor((distance + FAR) / PLANK);
    for (let k = first; k <= last; k++) {
      const z = k * PLANK - distance;
      const a = 0.45 * (1 - fogAt(z));
      if (a < 0.02) continue;
      ctx.strokeStyle = `rgba(18,9,4,${a})`;
      for (const side of [-1, 1]) {
        const p0 = this.p(side * WALL_X, 0, z);
        const p1 = this.p(side * CARPET_X, 0, z);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(18,9,4,0.35)';
    for (const side of [-1, 1]) {
      for (const x of [1.98, 2.18]) {
        const a = this.p(side * x, 0, NEAR + 0.3);
        const b = this.p(side * x, 0, FAR);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Red carpet runner under the lanes.
    const carpet = ctx.createLinearGradient(0, farY, 0, Math.min(nearY, this.h * 1.5));
    carpet.addColorStop(0, FOG_CSS);
    carpet.addColorStop(0.3, '#4a161c');
    carpet.addColorStop(1, '#93303a');
    this.quad(this.p(-CARPET_X, 0, NEAR), this.p(CARPET_X, 0, NEAR), this.p(CARPET_X, 0, FAR), this.p(-CARPET_X, 0, FAR), carpet);

    // Woven bands across the carpet.
    const bandFirst = Math.ceil((distance + NEAR) / 3);
    const bandLast = Math.floor((distance + FAR) / 3);
    for (let k = bandFirst; k <= bandLast; k++) {
      const z = k * 3 - distance;
      const f = fogAt(z);
      if (f > 0.95) continue;
      this.quad(this.p(-CARPET_X, 0, z), this.p(CARPET_X, 0, z), this.p(CARPET_X, 0, z + 0.25), this.p(-CARPET_X, 0, z + 0.25), `rgba(40,8,12,${0.35 * (1 - f)})`);
    }

    // Gold borders and faint lane dividers.
    for (const side of [-1, 1]) {
      for (const [x, width, alpha] of [
        [1.6, 2, 0.75],
        [1.68, 1, 0.5],
      ] as const) {
        const a = this.p(side * x, 0, NEAR + 0.3);
        const b = this.p(side * x, 0, FAR);
        const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        g.addColorStop(0, `rgba(222,178,96,${alpha})`);
        g.addColorStop(1, `rgba(222,178,96,0)`);
        ctx.strokeStyle = g;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    const dashFirst = Math.ceil((distance + NEAR) / 2);
    const dashLast = Math.floor((distance + FAR) / 2);
    for (let k = dashFirst; k <= dashLast; k++) {
      const z = k * 2 - distance;
      const f = fogAt(z);
      if (f > 0.9 || z < NEAR + 0.3) continue;
      for (const x of [-0.55, 0.55]) {
        this.quad(this.p(x - 0.025, 0, z), this.p(x + 0.025, 0, z), this.p(x + 0.025, 0, z + 0.8), this.p(x - 0.025, 0, z + 0.8), `rgba(222,178,96,${0.22 * (1 - f)})`);
      }
    }
  }

  private drawLightPools(distance: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    const first = Math.ceil((distance + NEAR) / LAMP_GAP - 0.5);
    const last = Math.floor((distance + FAR) / LAMP_GAP - 0.5);
    for (let k = first; k <= last; k++) {
      const z = (k + 0.5) * LAMP_GAP - distance;
      const f = fogAt(z);
      if (f > 0.9 || z < NEAR + 1.7) continue;
      const c = this.p(0, 0, z);
      const rx = 1.9 * c.s;
      const ry = Math.max(2, (this.p(0, 0, z - 1.6).y - this.p(0, 0, z + 1.6).y) / 2);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255,186,110,${0.3 * (1 - f)})`);
      g.addColorStop(1, 'rgba(255,186,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** How strongly the lantern lights a point (0..~0.5), for tinting nearby objects. */
  private litAt(x: number, y: number, z: number): number {
    const d = Math.hypot(x - this.lightX, (y - this.lightY) * 0.7, z * 0.8);
    const k = Math.max(0, 1 - d / 4.2);
    return k * k * 0.42 * this.glow;
  }

  /** The pool of light the firefly casts on the floor, stretching a little ahead of it. */
  private drawFireflyFloorLight(): void {
    const ctx = this.ctx;
    // A little warmer than the lantern itself, so it doesn't turn the red carpet muddy green.
    const [r, g, b] = [244, 226, 140];
    // Higher up, the pool spreads and fades.
    const lift = Math.max(0, this.lightY - HOVER_Y);
    const spread = 1 + lift * 0.35;
    const c = this.p(this.lightX, 0, 0.9);
    const rx = 1.7 * spread * this.p(this.lightX, 0, 0).s;
    const ry = Math.max(2, (this.p(this.lightX, 0, 0.9 - 2.4 * spread).y - this.p(this.lightX, 0, 0.9 + 2.4 * spread).y) / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, ry / rx);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const a = (0.42 * Math.min(1.08, this.glow)) / spread;
    grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},${a * 0.4})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Dims the scene away from the firefly, so the corridor feels dark and its lantern carries
   * the light. The clear area is stretched up the corridor to keep the path ahead readable.
   */
  private drawDarkness(game: Game): void {
    const ctx = this.ctx;
    const c = this.p(game.x, HOVER_Y + game.jumpY, 0);
    const inner = 0.9 * c.s * this.glow;
    const outer = Math.max(this.w, this.h) * 0.75;
    const stretch = 1.5;
    ctx.save();
    ctx.translate(c.x, c.y - outer * 0.25);
    ctx.scale(1, stretch);
    const grad = ctx.createRadialGradient(0, outer * 0.25 / stretch, inner, 0, 0, outer);
    grad.addColorStop(0, 'rgba(14,8,4,0)');
    grad.addColorStop(0.45, 'rgba(14,8,4,0.22)');
    grad.addColorStop(1, 'rgba(14,8,4,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(-this.w * 2, -this.h * 2, this.w * 4, this.h * 4);
    ctx.restore();
  }

  /** A soft glow on the bookshelf beside the firefly, brighter in the lane next to it. */
  private drawFireflyWallLight(side: -1 | 1): void {
    const ctx = this.ctx;
    const x = side * WALL_X;
    const k = Math.max(0, Math.min(1, 1 - (Math.abs(x - this.lightX) - 1.2) / 2.4));
    if (k <= 0) return;
    const [r, g, b] = FIREFLY_LIGHT;
    const z0 = NEAR + 0.2;
    const z1 = 6;
    ctx.save();
    ctx.beginPath();
    for (const [y, z] of [
      [0, z0],
      [CEIL_Y, z0],
      [CEIL_Y, z1],
      [0, z1],
    ] as const) {
      const q = this.p(x, y, z);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.clip();
    const c = this.p(x, this.lightY + 0.3, 0.4);
    const rad = 2.3 * c.s;
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.26 * k * this.glow})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(c.x - rad, c.y - rad, rad * 2, rad * 2);
    ctx.restore();
  }

  /** Bookshelf walls, drawn as vertical texture strips so they follow the perspective. */
  private drawShelves(distance: number, side: -1 | 1): void {
    const ctx = this.ctx;
    const x = side * WALL_X;
    const first = Math.floor((distance + NEAR) / SEG);
    const last = Math.floor((distance + FAR) / SEG);

    for (let k = last; k >= first; k--) {
      const z0 = k * SEG - distance;
      const z1 = z0 + SEG;
      if (z1 <= NEAR) continue;
      const salt = side > 0 ? 1 : 0;
      const tiers = [
        this.shelves[hash(k * 4 + salt) % this.shelves.length],
        this.shelves[hash(k * 4 + 2 + salt) % this.shelves.length],
      ];

      const pa = this.p(x, 0, Math.max(z0, NEAR));
      const pb = this.p(x, 0, z1);
      // Enough strips that each is ~4px wide, so shelf boards stay smooth up close.
      const n = Math.max(2, Math.min(140, Math.ceil(Math.abs(pa.x - pb.x) / 4)));

      for (let i = 0; i < n; i++) {
        const za = z0 + (SEG * i) / n;
        const zb = z0 + (SEG * (i + 1)) / n;
        if (za < NEAR) continue;
        const a = this.p(x, 0, za);
        const b = this.p(x, 0, zb);
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        if (right < 0 || left > this.w) continue;
        // Mirror the texture on the right wall so books read front-to-back on both sides.
        const u = side < 0 ? i / n : 1 - (i + 1) / n;
        const scale = (a.s + b.s) / 2;
        const floorY = (a.y + b.y) / 2;
        const tierPx = SHELF_H * (scale * this.ky) / ((this.kx + this.ky) / 2);
        for (let tier = 0; tier < 2; tier++) {
          const top = floorY - tierPx * (tier + 1);
          if (top + tierPx < 0) continue;
          const tex = tiers[tier];
          ctx.drawImage(tex, u * tex.width, 0, tex.width / n, tex.height, left, top, right - left + 0.75, tierPx + 0.5);
        }
      }

      // Fog and a little side shading over the whole section.
      const zs = Math.max(z0, NEAR);
      const f = fogAt((zs + z1) / 2);
      const corners = [this.p(x, 0, zs), this.p(x, CEIL_Y, zs), this.p(x, CEIL_Y, z1), this.p(x, 0, z1)] as const;
      this.quad(...corners, `rgba(${FOG.join(',')},${Math.min(1, f * 1.02)})`);
      this.quad(...corners, 'rgba(0,0,0,0.12)');
    }
  }

  // ---------- Objects ----------

  private drawObjects(game: Game): void {
    type Drawable = { z: number; draw: () => void };
    const items: Drawable[] = [];

    for (const o of game.obstacles) items.push({ z: o.z, draw: () => this.drawObstacle(o) });
    for (const l of game.letters) items.push({ z: l.z, draw: () => this.drawLetter(l) });

    const first = Math.ceil((game.distance + NEAR) / LAMP_GAP - 0.5);
    const last = Math.floor((game.distance + FAR) / LAMP_GAP - 0.5);
    for (let k = first; k <= last; k++) {
      const z = (k + 0.5) * LAMP_GAP - game.distance;
      if (z > NEAR + 0.6) items.push({ z, draw: () => this.drawLamp(z) });
    }

    // Darkness closes in away from the firefly; drawn over everything ahead of it.
    items.push({ z: 0.002, draw: () => this.drawDarkness(game) });
    items.push({ z: 0, draw: () => this.drawPlayer(game) });
    // Particles go just behind the firefly so the trail never covers it.
    items.push({ z: 0.001, draw: () => this.drawParticles() });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
  }

  /** A shaded box: front face, top (if below the camera) and the visible side. */
  private box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): void {
    const f = fogAt(z0);
    // The firefly sits behind every obstacle ahead, so front faces catch most of its light.
    const lit = this.litAt((x0 + x1) / 2, (y0 + y1) / 2, z0);
    if (y1 < CAM_Y) {
      this.quad(this.p(x0, y1, z0), this.p(x1, y1, z0), this.p(x1, y1, z1), this.p(x0, y1, z1), fogged(color, f, 0.18, lit * 0.5));
    }
    // Show the side that faces the camera.
    if (x0 > this.camX) {
      this.quad(this.p(x0, y0, z0), this.p(x0, y1, z0), this.p(x0, y1, z1), this.p(x0, y0, z1), fogged(color, f, -0.35, lit * 0.6));
    } else if (x1 < this.camX) {
      this.quad(this.p(x1, y0, z0), this.p(x1, y1, z0), this.p(x1, y1, z1), this.p(x1, y0, z1), fogged(color, f, -0.35, lit * 0.6));
    }
    this.quad(this.p(x0, y0, z0), this.p(x1, y0, z0), this.p(x1, y1, z0), this.p(x0, y1, z0), fogged(color, f, 0, lit));
  }

  /** Soft contact shadow on the floor. */
  private floorShadow(x0: number, x1: number, z0: number, z1: number, alpha: number): void {
    const f = fogAt(z0);
    this.quad(this.p(x0 - 0.05, 0.002, z0 - 0.08), this.p(x1 + 0.05, 0.002, z0 - 0.08), this.p(x1 + 0.05, 0.002, z1 + 0.1), this.p(x0 - 0.05, 0.002, z1 + 0.1), `rgba(10,4,2,${alpha * (1 - f)})`);
  }

  private drawObstacle(o: Obstacle): void {
    if (o.z < NEAR + 0.2) return;
    const rng = createRng(o.variant);
    const pick = () => BOOK_COLORS[Math.floor(rng() * BOOK_COLORS.length)];

    if (o.kind === 'pile') {
      const cx = LANE_X[o.lanes[0]];
      this.floorShadow(cx - 0.45, cx + 0.45, o.z, o.z + o.depth, 0.45);
      let y = 0;
      const count = 4;
      for (let i = 0; i < count; i++) {
        const h = i === count - 1 ? o.height - y : 0.1 + rng() * 0.05;
        const half = 0.34 + rng() * 0.09;
        const off = (rng() - 0.5) * 0.1;
        const dz = rng() * 0.12;
        const color = pick();
        this.box(cx - half + off, cx + half + off, y, y + h, o.z + dz, o.z + o.depth - 0.05 + dz * 0.3, color);
        // Page edges on the front.
        const f = fogAt(o.z);
        const a = this.p(cx - half + off + 0.04, y + h * 0.3, o.z + dz);
        const b = this.p(cx + half + off - 0.03, y + h * 0.7, o.z + dz);
        this.ctx.fillStyle = fogged('#e9dcc0', f, -0.05, this.litAt(cx, y, o.z));
        this.ctx.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
        y += h;
      }
    } else if (o.kind === 'cart') {
      const cx = LANE_X[o.lanes[0]];
      const x0 = cx - 0.43;
      const x1 = cx + 0.43;
      const z0 = o.z;
      const z1 = o.z + o.depth;
      const f = fogAt(z0);
      const lit = this.litAt(cx, 0.6, z0);
      this.floorShadow(x0, x1, z0, z1, 0.5);
      // Books standing on the top shelf.
      let bx = x0 + 0.04;
      while (bx < x1 - 0.08) {
        const w = 0.07 + rng() * 0.06;
        const h = 0.22 + rng() * 0.2;
        this.box(bx, Math.min(bx + w, x1 - 0.04), 1.02, 1.02 + h, z0 + 0.15, z1 - 0.15, pick());
        bx += w + 0.01;
      }
      // Cart body.
      this.box(x0, x1, 0.16, 1.02, z0, z1, '#6b4226');
      // Two open compartments with book spines on the front.
      for (const [yb, yt] of [
        [0.24, 0.56],
        [0.62, 0.94],
      ] as const) {
        const a = this.p(x0 + 0.06, yt, z0);
        const b = this.p(x1 - 0.06, yb, z0);
        this.ctx.fillStyle = fogged('#1a0f08', f);
        this.ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        let sx = x0 + 0.08;
        while (sx < x1 - 0.1) {
          const w = 0.05 + rng() * 0.05;
          const top = yb + (yt - yb) * (0.55 + rng() * 0.4);
          const p0 = this.p(sx, top, z0);
          const p1 = this.p(Math.min(sx + w, x1 - 0.08), yb, z0);
          this.ctx.fillStyle = fogged(pick(), f, -0.1, lit);
          this.ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          sx += w + 0.012;
        }
      }
      // Push handle and wheels.
      this.box(x0 + 0.05, x1 - 0.05, 1.32, 1.38, z1 - 0.06, z1, '#b08a4a');
      for (const wx of [x0 + 0.1, x1 - 0.1]) {
        const w = this.p(wx, 0.08, z0 + 0.05);
        this.ctx.fillStyle = fogged('#1b1410', f);
        this.ctx.beginPath();
        this.ctx.arc(w.x, w.y, Math.max(1, 0.08 * w.s), 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = fogged('#8f7a5a', f);
        this.ctx.beginPath();
        this.ctx.arc(w.x, w.y, Math.max(0.5, 0.03 * w.s), 0, Math.PI * 2);
        this.ctx.fill();
      }
    } else if (o.side) {
      this.drawLadder(o.side, o.z, o.z + o.depth);
    }
  }

  /** A wooden library ladder leaning across the corridor against one bookshelf. */
  private drawLadder(side: -1 | 1, z0: number, z1: number): void {
    const ctx = this.ctx;
    const f = fogAt(z0);
    const { footX, topX, topY } = ladderLine(side);
    const len = Math.hypot(topX - footX, topY);
    const lit = this.litAt((footX + topX) / 2, 1, z0);
    // Unit vector along the ladder and its perpendicular in the x/y plane.
    const ux = (topX - footX) / len;
    const uy = topY / len;
    const half = 0.07;
    const nx = -uy * half;
    const ny = ux * half;

    // Faint shadow on the floor beneath it.
    this.quad(this.p(footX, 0.002, z0 - 0.05), this.p(topX, 0.002, z0 - 0.05), this.p(topX, 0.002, z1 + 0.15), this.p(footX, 0.002, z1 + 0.15), `rgba(10,4,2,${0.25 * (1 - f)})`);

    const rail = (z: number, color: string) => {
      this.quad(this.p(footX + nx, ny, z), this.p(topX + nx, topY + ny, z), this.p(topX - nx, topY - ny, z), this.p(footX - nx, -ny, z), color);
    };

    // Back rail (with a darker edge for thickness), then rungs, then the front rail.
    rail(z1 + 0.06, fogged('#5a3a20', f, 0, lit * 0.4));
    rail(z1, fogged('#7a4f2c', f, -0.1, lit * 0.5));

    ctx.lineCap = 'butt';
    ctx.strokeStyle = fogged('#a8784a', f, 0, lit * 0.8);
    for (let d = 0.32; d < len - 0.15; d += 0.34) {
      const x = footX + ux * d;
      const y = uy * d;
      const a = this.p(x, y, z1 - 0.02);
      const b = this.p(x, y, z0 + 0.02);
      ctx.lineWidth = Math.max(1.5, 0.075 * ((a.s + b.s) / 2));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    rail(z0 + 0.06, fogged('#5a3a20', f, 0, lit * 0.6));
    rail(z0, fogged('#8a5a33', f, 0, lit));

    // Rubber feet on the floor and brass hooks over the shelf.
    for (const z of [z0, z1]) {
      const foot = this.p(footX, 0.03, z);
      ctx.fillStyle = fogged('#1b1410', f);
      ctx.beginPath();
      ctx.arc(foot.x, foot.y, Math.max(1, 0.06 * foot.s), 0, Math.PI * 2);
      ctx.fill();
      const hook = this.p(topX - side * 0.04, topY, z);
      ctx.fillStyle = fogged('#d8b25a', f);
      ctx.beginPath();
      ctx.arc(hook.x, hook.y, Math.max(1, 0.05 * hook.s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawLetter(l: Letter): void {
    if (l.z < NEAR + 0.3) return;
    let sprite = this.letterSprites.get(l.char);
    if (!sprite) {
      sprite = makeLetterSprite(l.char);
      this.letterSprites.set(l.char, sprite);
    }
    const y = l.y + Math.sin(this.t * 3 + l.phase) * 0.07;
    const p = this.p(LANE_X[l.lane], y, l.z);
    const size = 0.75 * p.s;
    const flip = 0.35 + 0.65 * Math.abs(Math.cos(this.t * 2.4 + l.phase));
    const f = fogAt(l.z);
    this.ctx.globalAlpha = 1 - f;
    this.ctx.drawImage(sprite, p.x - (size * flip) / 2, p.y - size / 2, size * flip, size);
    this.ctx.globalAlpha = 1;
  }

  private drawLamp(z: number): void {
    const ctx = this.ctx;
    const f = fogAt(z);
    const top = this.p(0, CEIL_Y, z);
    const shadeTop = 3.2;
    const shadeBottom = 2.9;
    const cordEnd = this.p(0, shadeTop, z);
    ctx.strokeStyle = fogged('#1a120c', f);
    ctx.lineWidth = Math.max(1, 0.025 * top.s);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(cordEnd.x, cordEnd.y);
    ctx.stroke();

    // Brass dome shade.
    const tl = this.p(-0.1, shadeTop, z);
    const tr = this.p(0.1, shadeTop, z);
    const br = this.p(0.32, shadeBottom, z);
    const bl = this.p(-0.32, shadeBottom, z);
    const g = ctx.createLinearGradient(bl.x, 0, br.x, 0);
    g.addColorStop(0, fogged('#5a4015', f));
    g.addColorStop(0.45, fogged('#d8b25a', f));
    g.addColorStop(1, fogged('#5a4015', f));
    this.quad(tl, tr, br, bl, g);

    // Glowing bulb and halo.
    const bulb = this.p(0, shadeBottom - 0.02, z);
    ctx.fillStyle = `rgba(255,244,214,${1 - f})`;
    ctx.beginPath();
    ctx.ellipse(bulb.x, bulb.y, Math.max(1, 0.3 * bulb.s), Math.max(0.5, 0.05 * bulb.s), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const r = 1.4 * bulb.s;
    const halo = ctx.createRadialGradient(bulb.x, bulb.y, 0, bulb.x, bulb.y, r);
    halo.addColorStop(0, `rgba(255,200,120,${0.45 * (1 - f)})`);
    halo.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(bulb.x, bulb.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawPlayer(game: Game): void {
    const air = Math.min(1, game.jumpY / 1.1);
    const bob = game.onGround ? Math.sin(this.t * 6) * 0.04 : 0;
    const p = this.p(game.x, HOVER_Y + game.jumpY + bob, 0);
    const tilt = Math.max(-1, Math.min(1, (LANE_X[game.lane] - game.x) * 1.5));
    const flicker = game.invulnerableFor > 0 && Math.floor(game.invulnerableFor * 12) % 2 === 0 ? 0.35 : 1;
    // No dark shadow: the firefly is the light source, so its pool of light is drawn on the floor instead.
    drawFirefly(this.ctx, p.x, p.y, 0.33 * p.s, { t: this.t, tilt, air, alpha: flicker, glow: this.glow });
  }
  // ---------- Particles ----------

  private updateParticles(game: Game, dt: number): void {
    // A sparse trail of glowing motes drifting off the lantern.
    this.trailTimer += dt;
    const interval = 1 / 26;
    while (this.trailTimer > interval) {
      this.trailTimer -= interval;
      // Trail particles are mostly carried along with the firefly and only slowly fall
      // behind, so they stay a compact tail instead of rushing at the camera.
      this.particles.push({
        x: game.x + (Math.random() - 0.5) * 0.16,
        y: HOVER_Y + game.jumpY - 0.1 + (Math.random() - 0.5) * 0.14,
        z: -0.02,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.35) * 0.3,
        vz: game.speed * 0.9,
        life: 0.7,
        maxLife: 0.7,
        size: 0.016 + Math.random() * 0.02,
        gold: false,
      });
    }

    const alive: Particle[] = [];
    for (const pt of this.particles) {
      pt.life -= dt;
      if (pt.life <= 0) continue;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt - game.speed * dt;
      if (pt.z < NEAR + 0.3) continue;
      alive.push(pt);
    }
    this.particles = alive;
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of this.particles) {
      const k = pt.life / pt.maxLife;
      const p = this.p(pt.x, pt.y, pt.z);
      // Cap the size so particles near the camera don't balloon.
      const r = Math.max(0.5, Math.min(pt.size * p.s, pt.size * 1.4 * this.p(0, 0, 0).s) * (0.35 + k * 0.65));
      // Firefly motes twinkle as they fade.
      const twinkle = 0.55 + 0.45 * Math.sin(pt.life * 26 + pt.size * 400);
      ctx.fillStyle = pt.gold ? `rgba(255,214,120,${k})` : `rgba(${FIREFLY_LIGHT.join(',')},${k * 0.85 * twinkle})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawDust(dt: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.dust) {
      d.y -= d.speed * dt;
      d.x += Math.sin(this.t * 0.5 + d.phase) * 0.004 * dt;
      if (d.y < -0.02) {
        d.y = 1.02;
        d.x = Math.random();
      }
      const a = 0.18 + 0.14 * Math.sin(this.t * 1.7 + d.phase);
      ctx.fillStyle = `rgba(255,220,170,${a})`;
      ctx.beginPath();
      ctx.arc(d.x * this.w, d.y * this.h, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Warm streaks rushing out from the vanishing point while boosted. */
  private drawSpeedLines(boost: number): void {
    const ctx = this.ctx;
    const vx = this.cx;
    const vy = this.hy;
    const maxR = Math.hypot(this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      // Each streak travels outward; phase offsets keep them staggered.
      const phase = (this.t * 2.2 + (hash(i * 7) % 1000) / 1000) % 1;
      const r0 = maxR * (0.15 + phase * 0.55);
      const r1 = r0 + maxR * (0.06 + phase * 0.12);
      const a = boost * 0.5 * Math.sin(phase * Math.PI);
      ctx.strokeStyle = `rgba(255,214,150,${a})`;
      ctx.lineWidth = 1.5 + phase * 2.5;
      ctx.beginPath();
      ctx.moveTo(vx + Math.cos(angle) * r0, vy + Math.sin(angle) * r0);
      ctx.lineTo(vx + Math.cos(angle) * r1, vy + Math.sin(angle) * r1);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- HUD ----------

  private drawHud(game: Game): void {
    const ctx = this.ctx;
    const pad = 16;
    const top = pad + 4;

    // Time bar.
    const barW = Math.min(this.w - pad * 2, 360);
    const barX = (this.w - barW) / 2;
    const frac = game.duration > 0 ? game.timeLeft / game.duration : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.roundRect(barX, top, barW, 10, 5);
    ctx.fill();
    const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    g.addColorStop(0, '#f2c35b');
    g.addColorStop(1, '#d97757');
    ctx.fillStyle = g;
    if (frac > 0) {
      this.roundRect(barX, top, Math.max(10, barW * frac), 10, 5);
      ctx.fill();
    }

    ctx.font = '600 16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    const rowY = top + 32;

    // Hearts.
    for (let i = 0; i < 3; i++) {
      this.heart(pad + 12 + i * 28, rowY, 10, i < game.hearts);
    }

    // Time left and score.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f3eee8';
    ctx.fillText(`${Math.ceil(game.timeLeft)}s`, this.w / 2, rowY);
    ctx.textAlign = 'right';
    const score = `${game.score}`;
    ctx.fillText(score, this.w - pad, rowY);
    ctx.fillStyle = '#f2c35b';
    ctx.fillText('✦', this.w - pad - ctx.measureText(score).width - 6, rowY);
  }

  private drawHint(text: string, alpha: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 32;
    const y = this.h * 0.93;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.roundRect(this.w / 2 - w / 2, y - 18, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#f3eee8';
    ctx.fillText(text, this.w / 2, y);
    ctx.globalAlpha = 1;
  }

  private heart(x: number, y: number, r: number, full: boolean): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
    ctx.closePath();
    if (full) {
      ctx.fillStyle = '#e0685c';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(243,238,232,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
}
