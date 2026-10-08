import { describe, expect, it } from 'vitest';
import { emptyCatalog } from './index';

describe('emptyCatalog', () => {
  it('knows no item, so every catalogId is treated as unknown (invariant I6)', () => {
    expect(emptyCatalog.getItem('desk.gaming.160')).toBeUndefined();
  });
});
