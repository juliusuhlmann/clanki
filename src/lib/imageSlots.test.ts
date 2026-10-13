import { describe, expect, it } from 'vitest';
import { ImageSlots } from './imageSlots';

const A = 'data:image/png;base64,QUFB';
const B = 'data:image/jpeg;base64,QkJC';

describe('ImageSlots', () => {
  it('collapses embedded images to placeholders and expands them back', () => {
    const slots = new ImageSlots();
    const text = `See ![graph](${A}) and ![](${B}), again ![x](${A})`;
    const short = slots.collapse(text);
    expect(short).toBe('See ![graph](image-1) and ![](image-2), again ![x](image-1)');
    expect(slots.expand(short)).toBe(text);
  });

  it('leaves URLs and unknown placeholders alone', () => {
    const slots = new ImageSlots();
    expect(slots.collapse('![a](https://x.org/a.png)')).toBe('![a](https://x.org/a.png)');
    expect(slots.expand('![a](image-3)')).toBe('![a](image-3)');
  });

  it('lists the images still in the text', () => {
    const slots = new ImageSlots();
    slots.slot(A);
    slots.slot(B);
    expect(slots.used('only ![](image-2) here')).toEqual([{ slot: 'image-2', src: B }]);
  });
});
