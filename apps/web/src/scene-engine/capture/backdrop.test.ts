import { afterEach, describe, expect, it } from 'vitest';
import { readBackdrop } from './backdrop';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('readBackdrop', () => {
  it('finds the first ancestor that paints a background', () => {
    const outer = document.createElement('div');
    outer.style.backgroundColor = 'rgb(10, 20, 30)';
    const inner = document.createElement('div');
    const canvas = document.createElement('canvas');
    inner.append(canvas);
    outer.append(inner);
    document.body.append(outer);
    expect(readBackdrop(canvas)).toBe('rgb(10, 20, 30)');
  });

  it('falls back when nothing paints one', () => {
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    expect(readBackdrop(canvas, '#123456')).toBe('#123456');
  });
});
