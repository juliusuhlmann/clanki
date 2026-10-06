import katex from 'katex';

// Card text is plain text with two additions, so cards made by scripts can carry maths and pictures:
//   LaTeX:  $inline$  \(inline\)  $$display$$  \[display\]      (\$ is a literal dollar sign)
//   Images: ![alt text](https://… or data:image/png;base64,…)
// Everything else is escaped, so card text can never inject HTML or scripts.

const IMAGE = /^!\[([^\]\n]*)\]\(([^)\s]+)\)/;
/** http(s) URLs, and inline images in common raster formats or SVG (scripts never run inside <img>). */
const SAFE_SRC = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,)/i;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function math(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore' });
}

/** End of an inline $…$ starting at `open`, or -1 if this dollar doesn't open maths (e.g. "costs $5 and $6"). */
function inlineDollarEnd(text: string, open: number): number {
  const first = text[open + 1];
  if (first === undefined || /\s/.test(first)) return -1;
  for (let i = open + 1; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '\n' && text[i + 1] === '\n') return -1;
    if (text[i] === '$') {
      if (/\s/.test(text[i - 1]) || /\d/.test(text[i + 1] ?? '')) return -1;
      return i;
    }
  }
  return -1;
}

function render(text: string): string {
  let out = '';
  let plain = '';
  const flush = () => {
    out += escapeHtml(plain);
    plain = '';
  };
  /**
   * Emits a block (display maths or an image) and returns the index after it. Blocks sit on their
   * own line already, so one line break directly before and after is dropped to avoid blank gaps.
   */
  const block = (html: string, after: number): number => {
    plain = plain.replace(/\r?\n$/, '');
    flush();
    out += html;
    return text.startsWith('\r\n', after) ? after + 2 : text[after] === '\n' ? after + 1 : after;
  };
  /** Emits maths between the opening delimiter at `i` and `close`; returns the new index or -1. */
  const delimited = (i: number, openLen: number, close: string, display: boolean): number => {
    const end = text.indexOf(close, i + openLen);
    if (end === -1) return -1;
    const html = math(text.slice(i + openLen, end), display);
    if (display) return block(html, end + close.length);
    flush();
    out += html;
    return end + close.length;
  };

  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    let next = -1;
    if (two === '\\$') {
      plain += '$';
      next = i + 2;
    } else if (two === '$$') {
      next = delimited(i, 2, '$$', true);
    } else if (two === '\\[') {
      next = delimited(i, 2, '\\]', true);
    } else if (two === '\\(') {
      next = delimited(i, 2, '\\)', false);
    } else if (text[i] === '$') {
      const end = inlineDollarEnd(text, i);
      if (end !== -1) {
        flush();
        out += math(text.slice(i + 1, end), false);
        next = end + 1;
      }
    } else if (two === '![') {
      const m = IMAGE.exec(text.slice(i));
      if (m && SAFE_SRC.test(m[2])) {
        const img = `<img class="card-img" src="${escapeHtml(m[2])}" alt="${escapeHtml(m[1])}" loading="lazy" decoding="async">`;
        next = block(img, i + m[0].length);
      }
    }
    if (next === -1) {
      plain += text[i];
      i++;
    } else {
      i = next;
    }
  }
  flush();
  return out;
}

const cache = new Map<string, string>();

/** Card text as safe HTML with maths and images rendered. Show it in an element with `white-space: pre-wrap`. */
export function renderCardText(text: string): string {
  let html = cache.get(text);
  if (html === undefined) {
    html = render(text);
    if (cache.size > 1000) cache.clear();
    cache.set(text, html);
  }
  return html;
}

/** Lower-cased card text for search, with images reduced to their alt text (not their URL or data). */
export function searchableText(text: string): string {
  return text.replace(/!\[([^\]\n]*)\]\([^)\s]+\)/g, '$1').toLowerCase();
}
