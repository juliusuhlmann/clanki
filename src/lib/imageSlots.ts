// Embedded images make card text unreadable while editing (a data URL is tens of thousands of
// characters). Editors show a short placeholder instead, `![alt](image-1)`, and expand it on save.

const DATA_IMAGE = /!\[([^\]\n]*)\]\((data:image\/[^)\s]+)\)/g;
const SLOT = /!\[([^\]\n]*)\]\(image-(\d+)\)/g;

/** The images of one text field, numbered in the order they were seen. */
export class ImageSlots {
  readonly srcs: string[] = [];

  /** Placeholder for an image source, e.g. `image-2`. The same source always gets the same one. */
  slot(src: string): string {
    let i = this.srcs.indexOf(src);
    if (i < 0) i = this.srcs.push(src) - 1;
    return `image-${i + 1}`;
  }

  /** Card text with embedded images replaced by placeholders. */
  collapse(text: string): string {
    return text.replace(DATA_IMAGE, (_, alt: string, src: string) => `![${alt}](${this.slot(src)})`);
  }

  /** Placeholders back to embedded images; unknown ones stay as typed. */
  expand(text: string): string {
    return text.replace(SLOT, (m, alt: string, n: string) => {
      const src = this.srcs[Number(n) - 1];
      return src ? `![${alt}](${src})` : m;
    });
  }

  /** Images whose placeholder is in the text, for thumbnails. */
  used(text: string): { slot: string; src: string }[] {
    const seen = new Set<string>();
    for (const m of text.matchAll(SLOT)) if (this.srcs[Number(m[2]) - 1]) seen.add(m[2]);
    return [...seen].map((n) => ({ slot: `image-${n}`, src: this.srcs[Number(n) - 1] }));
  }
}

/** Width images are scaled down to: sharp on a phone, small enough to sync. */
const MAX_WIDTH = 900;

/** A picked, pasted or dropped image as a small data URL: scaled to phone width, PNG or JPEG, whichever is smaller. */
export async function compressImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = canvas.toDataURL('image/png');
  // JPEG has no transparency: put the image on white first.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL('image/jpeg', 0.85);
  return png.length <= jpeg.length ? png : jpeg;
}
