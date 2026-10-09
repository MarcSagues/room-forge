'use client';

import type { ProjectId } from '@roomforge/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserLockApis, createProjectLock, type LockRole, type ProjectLock } from '@/persistence';

type CreateLock = (options: {
  projectId: ProjectId;
  onHandover: () => Promise<void>;
}) => ProjectLock;

const browserLock: CreateLock = (options) =>
  createProjectLock({ ...browserLockApis(), ...options });

interface Held {
  id: ProjectId;
  lock: ProjectLock;
  release?: ReturnType<typeof setTimeout>;
}

/**
 * Whether this tab may edit the project (P6-09). `null` means there is nothing to share with other
 * tabs (projects kept in memory): the tab owns it. React Strict Mode runs effects twice in
 * development; letting go of the lock is deferred a tick so the second run keeps the first lock
 * instead of finding it still held and opening read-only.
 */
export function useProjectLock(
  projectId: ProjectId | null,
  onHandover: () => Promise<void>,
  create: CreateLock = browserLock,
): { role: LockRole; takeOver: () => Promise<void> } {
  const [role, setRole] = useState<LockRole>(projectId ? 'pending' : 'owner');
  const held = useRef<Held | null>(null);
  const handover = useRef(onHandover);
  handover.current = onHandover;

  useEffect(() => {
    if (!projectId) {
      setRole('owner');
      return;
    }
    let entry = held.current;
    if (entry?.id === projectId) {
      clearTimeout(entry.release);
    } else {
      entry?.lock.dispose();
      entry = {
        id: projectId,
        lock: create({ projectId, onHandover: () => handover.current() }),
      };
      held.current = entry;
    }
    const current = entry;
    const sync = () => setRole(current.lock.role());
    sync();
    const unsubscribe = current.lock.subscribe(sync);
    return () => {
      unsubscribe();
      current.release = setTimeout(() => {
        current.lock.dispose();
        if (held.current === current) held.current = null;
      }, 0);
    };
  }, [projectId, create]);

  const takeOver = useCallback(async () => {
    await held.current?.lock.takeOver();
  }, []);
  return { role, takeOver };
}
