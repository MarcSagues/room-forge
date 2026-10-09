import { ProjectIdSchema } from '@roomforge/core';
import { createFakeClock } from '@roomforge/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  createProjectLock,
  type LockManagerLike,
  type ProjectLockOptions,
  projectLockName,
} from './project-lock';
import { createChannelHub, createFakeLockManager } from './testing/fake-locks';
import { createFakeScheduler } from './testing/fake-scheduler';

const PROJECT = ProjectIdSchema.parse('project-1');

function world(withLocks = true) {
  const clock = createFakeClock(0);
  const scheduler = createFakeScheduler(clock);
  const locks = withLocks ? createFakeLockManager() : undefined;
  const hub = createChannelHub();
  const tab = (extra: Partial<ProjectLockOptions> = {}) =>
    createProjectLock({
      projectId: PROJECT,
      locks,
      openChannel: hub.open,
      scheduler,
      ...extra,
    });
  return { scheduler, locks, tab, settle: () => scheduler.advance(0) };
}

describe('createProjectLock with Web Locks', () => {
  it('makes the first tab the owner and the second a reader', async () => {
    const { tab, settle } = world();
    const first = tab();
    await settle();
    const second = tab();
    await settle();
    expect(first.role()).toBe('owner');
    expect(second.role()).toBe('reader');
  });

  it('lets a tab own a project once the owner closes', async () => {
    const { tab, settle } = world();
    const first = tab();
    await settle();
    first.dispose();
    await settle();
    const second = tab();
    await settle();
    expect(second.role()).toBe('owner');
  });

  it('does not block other projects', async () => {
    const { locks, scheduler } = world();
    const make = (id: string) =>
      createProjectLock({ projectId: ProjectIdSchema.parse(id), locks, scheduler });
    const a = make('project-a');
    const b = make('project-b');
    await scheduler.advance(0);
    expect([a.role(), b.role()]).toEqual(['owner', 'owner']);
  });

  it('takes over after the owner writes what is pending, and the owner turns reader', async () => {
    const { tab, settle, locks } = world();
    const order: string[] = [];
    const first = tab({
      onHandover: async () => {
        order.push('flushed');
      },
    });
    await settle();
    const second = tab();
    await settle();
    first.subscribe((role) => order.push(`first:${role}`));
    second.subscribe((role) => order.push(`second:${role}`));

    await second.takeOver();

    expect(first.role()).toBe('reader');
    expect(second.role()).toBe('owner');
    expect(order).toEqual(['flushed', 'first:reader', 'second:owner']);
    expect(locks?.held(projectLockName(PROJECT))).toBe(true);
  });

  it('steals the lock when the owner does not answer in time', async () => {
    const { tab, settle, scheduler } = world();
    tab({ onHandover: () => new Promise(() => {}) });
    await settle();
    const second = tab();
    await settle();

    const takingOver = second.takeOver();
    await scheduler.advance(2_999);
    expect(second.role()).toBe('reader');
    await scheduler.advance(1);
    await takingOver;

    expect(second.role()).toBe('owner');
  });

  it('turns the owner into a reader when its lock is stolen', async () => {
    const { tab, settle, locks } = world();
    const first = tab();
    await settle();
    await locks?.request(projectLockName(PROJECT), { steal: true }, () => {});
    await settle();
    expect(first.role()).toBe('reader');
  });

  it('can take over a project nobody owns any more', async () => {
    const { tab, settle } = world();
    const first = tab();
    await settle();
    const second = tab();
    await settle();
    first.dispose();
    await second.takeOver();
    expect(second.role()).toBe('owner');
  });

  it('ignores messages it does not know', async () => {
    const hub = createChannelHub();
    const { scheduler, locks } = world();
    const onHandover = vi.fn(async () => {});
    const owner = createProjectLock({
      projectId: PROJECT,
      locks,
      scheduler,
      openChannel: hub.open,
      onHandover,
    });
    await scheduler.advance(0);
    const stranger = hub.open(projectLockName(PROJECT));
    for (const data of [null, 'release', { type: 'drop-tables' }, { kind: 'release' }]) {
      stranger.postMessage(data);
    }
    await scheduler.advance(0);
    expect(onHandover).not.toHaveBeenCalled();
    expect(owner.role()).toBe('owner');
  });
});

describe('createProjectLock without Web Locks', () => {
  it('makes a tab the owner when nobody answers, and a later one a reader', async () => {
    const { tab, scheduler } = world(false);
    const first = tab();
    await scheduler.advance(300);
    const second = tab();
    await scheduler.advance(300);
    expect(first.role()).toBe('owner');
    expect(second.role()).toBe('reader');
  });

  it('takes over when the owner says it let go', async () => {
    const { tab, scheduler } = world(false);
    const onHandover = vi.fn(async () => {});
    const first = tab({ onHandover });
    await scheduler.advance(300);
    const second = tab();
    await scheduler.advance(300);

    await second.takeOver();

    expect(onHandover).toHaveBeenCalledTimes(1);
    expect(first.role()).toBe('reader');
    expect(second.role()).toBe('owner');
  });

  it('takes over after the timeout when the owner is gone', async () => {
    const { tab, scheduler } = world(false);
    const first = tab();
    await scheduler.advance(300);
    const second = tab();
    await scheduler.advance(300);
    first.dispose();

    const takingOver = second.takeOver();
    await scheduler.advance(3_000);
    await takingOver;
    expect(second.role()).toBe('owner');
  });

  it('owns at once with neither Web Locks nor channels', async () => {
    const scheduler = createFakeScheduler(createFakeClock(0));
    const lock = createProjectLock({ projectId: PROJECT, scheduler });
    await scheduler.advance(0);
    expect(lock.role()).toBe('owner');
  });
});

it('stops reporting after dispose', async () => {
  const locks: LockManagerLike = createFakeLockManager();
  const scheduler = createFakeScheduler(createFakeClock(0));
  const lock = createProjectLock({ projectId: PROJECT, locks, scheduler });
  const listener = vi.fn();
  lock.subscribe(listener);
  lock.dispose();
  await scheduler.advance(0);
  expect(listener).not.toHaveBeenCalled();
});
