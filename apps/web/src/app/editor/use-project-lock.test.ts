import { type ProjectId, ProjectIdSchema } from '@roomforge/core';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LockRole, ProjectLock } from '@/persistence';
import { useProjectLock } from './use-project-lock';

const PROJECT = ProjectIdSchema.parse('project-1');

/** A lock whose role the test sets; counts how many were made and let go. */
function fakeLocks(initial: LockRole) {
  const made: Array<ProjectLock & { set(role: LockRole): void; disposed: boolean }> = [];
  const create = vi.fn((_options: { projectId: ProjectId; onHandover: () => Promise<void> }) => {
    let role = initial;
    const listeners = new Set<(role: LockRole) => void>();
    const lock = {
      disposed: false,
      role: () => role,
      set(next: LockRole) {
        role = next;
        for (const listener of listeners) listener(role);
      },
      subscribe(listener: (role: LockRole) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      takeOver: vi.fn(async () => lock.set('owner')),
      dispose() {
        lock.disposed = true;
      },
    };
    made.push(lock);
    return lock;
  });
  return { create, made };
}

describe('useProjectLock', () => {
  it('owns at once when there is nothing to share (projects in memory)', () => {
    const { create } = fakeLocks('reader');
    const { result } = renderHook(() => useProjectLock(null, async () => {}, create));
    expect(result.current.role).toBe('owner');
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps one lock through the double effect of Strict Mode', async () => {
    const { create, made } = fakeLocks('owner');
    const { result } = renderHook(() => useProjectLock(PROJECT, async () => {}, create), {
      wrapper: StrictMode,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(create).toHaveBeenCalledTimes(1);
    expect(made[0]?.disposed).toBe(false);
    expect(result.current.role).toBe('owner');
  });

  it('follows the role, takes over, and lets go when unmounted', async () => {
    const { create, made } = fakeLocks('reader');
    const { result, unmount } = renderHook(() => useProjectLock(PROJECT, async () => {}, create));
    expect(result.current.role).toBe('reader');

    await act(() => result.current.takeOver());
    expect(result.current.role).toBe('owner');

    act(() => made[0]?.set('reader'));
    expect(result.current.role).toBe('reader');

    unmount();
    await waitFor(() => expect(made[0]?.disposed).toBe(true));
  });

  it('hands the latest handover callback to the lock', async () => {
    const { create } = fakeLocks('owner');
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    const { rerender } = renderHook(({ cb }) => useProjectLock(PROJECT, cb, create), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    await create.mock.calls[0]?.[0].onHandover();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
