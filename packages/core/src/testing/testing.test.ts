import { describe, expect, it } from 'vitest';
import { createFakeClock, createSeqIdGen } from './index';

describe('createSeqIdGen', () => {
  it('produces deterministic sequential ids', () => {
    const next = createSeqIdGen('obj');
    expect([next(), next(), next()]).toEqual(['obj-1', 'obj-2', 'obj-3']);
  });

  it('keeps independent counters per generator', () => {
    const a = createSeqIdGen();
    const b = createSeqIdGen();
    a();
    expect(b()).toBe('id-1');
  });
});

describe('createFakeClock', () => {
  it('starts at the given time and only moves when told to', () => {
    const clock = createFakeClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(600);
    expect(clock.now()).toBe(1600);
    clock.set(5);
    expect(clock.now()).toBe(5);
  });
});
