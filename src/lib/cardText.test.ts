import { describe, expect, it } from 'vitest';
import { renderCardText, searchableText } from './cardText';

describe('renderCardText', () => {
  it('escapes plain text', () => {
    expect(renderCardText('a < b & <script>alert(1)</script>')).toBe('a &lt; b &amp; &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders inline and display maths', () => {
    const inline = renderCardText('Euler: $e^{i\\pi} = -1$.');
    expect(inline).toMatch(/^Euler: <span class="katex">/);
    expect(inline).not.toContain('katex-display');
    expect(inline.endsWith('.')).toBe(true);

    for (const text of ['$$\\int_0^1 x\\,dx$$', '\\[\\int_0^1 x\\,dx\\]']) {
      expect(renderCardText(text)).toContain('katex-display');
    }
    expect(renderCardText('\\(x^2\\)')).toContain('class="katex"');
  });

  it('leaves money and escaped dollars alone', () => {
    expect(renderCardText('costs $5 and $6')).toBe('costs $5 and $6');
    expect(renderCardText('\\$x\\$')).toBe('$x$');
    expect(renderCardText('a $ b')).toBe('a $ b');
  });

  it('drops one line break around display maths and images, which are blocks already', () => {
    const html = renderCardText('It is\n$$x$$\nso.');
    expect(html.startsWith('It is<span class="katex-display">')).toBe(true);
    expect(html.endsWith('</span>so.')).toBe(true);
    expect(renderCardText('a\n\n![](https://e.com/a.png)\nb')).toBe(
      'a\n<img class="card-img" src="https://e.com/a.png" alt="" loading="lazy" decoding="async">b',
    );
  });

  it('shows broken LaTeX as an error instead of throwing', () => {
    expect(renderCardText('$\\frac{1}{$')).toContain('katex-error');
  });

  it('renders images from URLs and inline data', () => {
    const url = renderCardText('see ![a graph](https://example.com/g.png) here');
    expect(url).toBe('see <img class="card-img" src="https://example.com/g.png" alt="a graph" loading="lazy" decoding="async"> here');
    expect(renderCardText('![](data:image/png;base64,iVBORw0KGgo=)')).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('refuses unsafe image sources and escapes attributes', () => {
    expect(renderCardText('![x](javascript:alert(1))')).not.toContain('<img');
    expect(renderCardText('![x](data:text/html;base64,PHNjcmlwdD4=)')).not.toContain('<img');
    expect(renderCardText('!["onerror="x](https://e.com/a.png)')).toContain('alt="&quot;onerror=&quot;x"');
  });
});

describe('searchableText', () => {
  it('keeps alt text but not image data', () => {
    expect(searchableText('A ![Graph of f](data:image/png;base64,QUJDeHl6) b')).toBe('a graph of f b');
  });
});
