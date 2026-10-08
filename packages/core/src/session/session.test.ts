import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ObjectId, SceneDocument } from '../domain';
import { buildDocument, createFakeClock, createFixtureCatalog, createSeqIdGen } from '../testing';
import { createEditorSession } from './session';
import type { Command } from './types';

// core has no Node types: read the variable without them.
const perfBudgetsOff =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.PERF_BUDGETS === 'off';

const DESK = 'desk-1' as ObjectId;
const MONITOR = 'monitor-1' as ObjectId;

function setup(initialDocument: SceneDocument = buildDocument()) {
  const clock = createFakeClock(1000);
  const session = createEditorSession({
    initialDocument,
    catalog: createFixtureCatalog(),
    idGen: createSeqIdGen('new'),
    clock,
  });
  return { session, clock };
}

const moveDesk = (x: number): Command => ({
  type: 'test/moveDesk',
  label: 'Move desk',
  apply(draft) {
    const desk = draft.objects[DESK];
    if (desk) desk.transform.position[0] = x;
  },
});

const setAmbient = (ambient: number): Command => ({
  type: 'test/setAmbient',
  label: 'Set ambient',
  apply(draft) {
    draft.lighting.ambient = ambient;
  },
});

describe('EditorSession.execute', () => {
  it('applies a command, updates the store and emits document:changed once', () => {
    const { session } = setup();
    const changed = vi.fn();
    const stored = vi.fn();
    session.on('document:changed', changed);
    session.store.subscribe(stored);

    const result = session.execute(moveDesk(2.5));

    expect(result.ok).toBe(true);
    expect(session.getState().document.objects[DESK]?.transform.position[0]).toBe(2.5);
    expect(stored).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith({
      source: 'command',
      patches: [{ op: 'replace', path: ['objects', DESK, 'transform', 'position', 0], value: 2.5 }],
    });
    if (result.ok) {
      expect(result.inverse).toEqual([
        { op: 'replace', path: ['objects', DESK, 'transform', 'position', 0], value: 2 },
      ]);
    }
  });

  it('rejects a command that breaks an invariant and leaves the document untouched', () => {
    const { session } = setup();
    const before = session.getState().document;
    const changed = vi.fn();
    session.on('document:changed', changed);

    const result = session.execute(moveDesk(-3)); // desk would leave the room (I3)

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invariant');
      expect(result.error.violations?.map((v) => v.invariant)).toEqual(['I3']);
    }
    expect(session.getState().document).toBe(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it('lets a command fail with a domain error, discarding its partial changes', () => {
    const { session } = setup();
    const before = session.getState().document;
    const result = session.execute({
      type: 'test/fail',
      label: 'Fail',
      apply(draft) {
        draft.lighting.ambient = 0.9;
        return { code: 'not-found', message: 'No such object' };
      },
    });
    expect(result).toEqual({ ok: false, error: { code: 'not-found', message: 'No such object' } });
    expect(session.getState().document).toBe(before);
  });

  it('turns an unexpected exception into an error result and a session:error event', () => {
    const { session } = setup();
    const before = session.getState().document;
    const onError = vi.fn();
    session.on('session:error', onError);

    const result = session.execute({
      type: 'test/throw',
      label: 'Throw',
      apply() {
        throw new Error('boom');
      },
    });

    expect(result).toEqual({ ok: false, error: { code: 'exception', message: 'boom' } });
    expect(onError).toHaveBeenCalledWith({ error: { code: 'exception', message: 'boom' } });
    expect(session.getState().document).toBe(before);
  });

  it('treats a command that changes nothing as a successful no-op', () => {
    const { session } = setup();
    const before = session.getState().document;
    const changed = vi.fn();
    session.on('document:changed', changed);
    expect(session.execute(moveDesk(2))).toEqual({ ok: true, patches: [], inverse: [] });
    expect(session.getState().document).toBe(before);
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps untouched parts of the document by reference (structural sharing)', () => {
    const { session } = setup();
    const before = session.getState().document;
    session.execute(moveDesk(2.5));
    const after = session.getState().document;

    expect(after).not.toBe(before);
    expect(after.objects).not.toBe(before.objects);
    expect(after.objects[DESK]).not.toBe(before.objects[DESK]);
    expect(after.objects[MONITOR]).toBe(before.objects[MONITOR]);
    expect(after.rooms).toBe(before.rooms);
    expect(after.openings).toBe(before.openings);
    expect(after.lighting).toBe(before.lighting);
  });

  it('gives commands the injected id generator, clock and catalog', () => {
    const { session } = setup();
    const seen: unknown[] = [];
    session.execute({
      type: 'test/context',
      label: 'Context',
      apply(_draft, ctx) {
        seen.push(ctx.idGen(), ctx.clock.now(), ctx.catalog.getItem('desk.basic.120')?.size.w);
      },
    });
    expect(seen).toEqual(['new-1', 1000, 1.2]);
  });

  // Timing budgets are meaningless under coverage instrumentation with the whole suite running in
  // parallel, so `pnpm test:coverage` sets PERF_BUDGETS=off; `pnpm check` (also in CI) asserts it.
  it.skipIf(perfBudgetsOff)('runs 10 000 trivial commands in under 500 ms', () => {
    const { session } = setup();
    const run = () => {
      const start = Date.now();
      for (let i = 0; i < 10_000; i += 1) session.execute(setAmbient((i % 100) / 100));
      return Date.now() - start;
    };
    run(); // warm-up (JIT)
    // Best of three, so a busy CI runner does not make it flaky.
    const best = Math.min(run(), run(), run());
    expect(session.getState().document.lighting.ambient).toBe(0.99);
    expect(best).toBeLessThan(500);
  });
});

describe('EditorSession state access', () => {
  it('notifies selector subscribers only when the selected value changes', () => {
    const { session } = setup();
    const listener = vi.fn();
    session.subscribe((state) => state.document.objects[DESK]?.transform, listener);

    session.execute(setAmbient(0.1));
    expect(listener).not.toHaveBeenCalled();

    session.execute(moveDesk(2.5));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ position: [2.5, 0, 1.5] });
  });

  it('supports a custom equality function and unsubscribing', () => {
    const { session } = setup();
    const listener = vi.fn();
    const stop = session.subscribe(
      (state) => [state.document.lighting.ambient],
      listener,
      (a, b) => a[0] === b[0],
    );
    session.execute(moveDesk(2.5)); // new array each time, same ambient → equal
    expect(listener).not.toHaveBeenCalled();
    stop();
    session.execute(setAmbient(0.9));
    expect(listener).not.toHaveBeenCalled();
  });

  it('exposes a frozen, deeply readonly document', () => {
    const { session } = setup();
    const doc = session.getState().document;
    expect(Object.isFrozen(doc)).toBe(true);
    expect(Object.isFrozen(doc.objects[DESK]?.transform.position)).toBe(true);
    expect(() => {
      // @ts-expect-error the document can only change through a command
      doc.lighting.ambient = 1;
    }).toThrow(TypeError);
    expectTypeOf(session.store).not.toHaveProperty('setState');
  });
});
