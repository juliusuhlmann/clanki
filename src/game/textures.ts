// Pre-rendered images, drawn once and reused every frame.

import { createRng } from './spawner';

export const SHELF_TEX_W = 160;
export const SHELF_TEX_H = 240;

export const BOOK_COLORS = [
  '#8c2f39',
  '#2f5d50',
  '#2b4a6f',
  '#b5832f',
  '#6b3a5b',
  '#3f6b3a',
  '#9c5b2e',
  '#d8c9a3',
  '#4d3b2a',
  '#7a1f2b',
  '#1f3f5b',
  '#5a6b2f',
];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** One bookshelf section: wooden frame, five shelves full of books. */
function drawShelf(ctx: CanvasRenderingContext2D, rng: () => number): void {
  const W = SHELF_TEX_W;
  const H = SHELF_TEX_H;
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];

  // Back panel.
  const back = ctx.createLinearGradient(0, 0, W, 0);
  back.addColorStop(0, '#150c07');
  back.addColorStop(0.5, '#1f130b');
  back.addColorStop(1, '#150c07');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, W, H);

  const top = 10;
  const bottom = H - 16;
  const rows = 5;
  const rowH = (bottom - top) / rows;
  const board = 5;

  for (let r = 0; r < rows; r++) {
    const rowTop = top + r * rowH;
    const floor = rowTop + rowH - board;
    let x = 9;
    while (x < W - 10) {
      const roll = rng();
      if (roll < 0.05) {
        x += 6 + rng() * 10; // gap
        continue;
      }
      const w = Math.min(5 + rng() * 8, W - 10 - x);
      if (w < 3) break;
      const h = (rowH - board) * (0.6 + rng() * 0.33);
      const color = pick(BOOK_COLORS);
      if (roll > 0.97 && x < W - 30) {
        // A book leaning against its neighbour.
        ctx.save();
        ctx.translate(x, floor);
        ctx.rotate(0.28);
        ctx.fillStyle = color;
        ctx.fillRect(0, -h, w, h);
        ctx.restore();
        x += w + h * 0.28;
        continue;
      }
      const y = floor - h;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      // Spine details: highlight, darker caps, gold bands.
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y, 1, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w - 1, y, 1, h);
      ctx.fillRect(x, y, w, 2);
      if (rng() < 0.55) {
        ctx.fillStyle = 'rgba(222,180,90,0.75)';
        ctx.fillRect(x + 1, y + h * 0.18, w - 2, 1.5);
        ctx.fillRect(x + 1, y + h * 0.8, w - 2, 1.5);
      }
      x += w + (rng() < 0.3 ? 1 : 0);
    }

    // Shadow under the shelf above.
    const shadow = ctx.createLinearGradient(0, rowTop, 0, rowTop + rowH * 0.45);
    shadow.addColorStop(0, 'rgba(0,0,0,0.55)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(0, rowTop, W, rowH * 0.45);

    // Shelf board.
    ctx.fillStyle = '#6b4226';
    ctx.fillRect(0, floor, W, board);
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(0, floor, W, 1);
  }

  // Frame: posts, crown, skirting.
  const post = ctx.createLinearGradient(0, 0, 9, 0);
  post.addColorStop(0, '#3e2414');
  post.addColorStop(0.5, '#6b4226');
  post.addColorStop(1, '#3e2414');
  ctx.fillStyle = post;
  ctx.fillRect(0, 0, 9, H);
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.fillRect(0, 0, 9, H);
  ctx.restore();

  ctx.fillStyle = '#4a2c18';
  ctx.fillRect(0, 0, W, top);
  ctx.fillStyle = '#7a4d2c';
  ctx.fillRect(0, top - 2, W, 2);
  ctx.fillStyle = '#3a2213';
  ctx.fillRect(0, bottom, W, H - bottom);
  ctx.fillStyle = '#5a3720';
  ctx.fillRect(0, bottom, W, 2);
}

/** Shelf textures, rendered at 2x so they stay crisp on near walls and high-DPI screens. */
export function makeShelfTextures(count: number, seed = 7, scale = 2): HTMLCanvasElement[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const [c, ctx] = canvas(SHELF_TEX_W * scale, SHELF_TEX_H * scale);
    ctx.scale(scale, scale);
    drawShelf(ctx, rng);
    return c;
  });
}

/** A glowing golden letter for the collectibles. */
export function makeLetterSprite(char: string): HTMLCanvasElement {
  const size = 128;
  const [c, ctx] = canvas(size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 76px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(255, 200, 90, 0.95)';
  ctx.shadowBlur = 26;
  const g = ctx.createLinearGradient(0, 30, 0, 98);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.5, '#f2c35b');
  g.addColorStop(1, '#c98a2a');
  ctx.fillStyle = g;
  ctx.fillText(char, size / 2, size / 2 + 4);
  ctx.shadowBlur = 0;
  ctx.fillText(char, size / 2, size / 2 + 4);
  return c;
}

export function makeVignette(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(8,4,2,0.65)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}
