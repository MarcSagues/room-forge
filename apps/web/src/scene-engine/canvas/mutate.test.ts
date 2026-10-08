import { describe, expect, it, vi } from 'vitest';
import { createMutate } from './mutate';

describe('createMutate', () => {
  it('runs the mutation, returns its result and requests a frame afterwards', () => {
    const order: string[] = [];
    const invalidate = vi.fn(() => order.push('invalidate'));
    const mutate = createMutate(invalidate);
    const result = mutate(() => {
      order.push('mutation');
      return 42;
    });
    expect(result).toBe(42);
    expect(order).toEqual(['mutation', 'invalidate']);
  });

  it('still requests a frame when the mutation throws half-way', () => {
    const invalidate = vi.fn();
    const mutate = createMutate(invalidate);
    expect(() =>
      mutate(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
