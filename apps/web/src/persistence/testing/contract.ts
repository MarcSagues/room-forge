import {
  LIMITS,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  type SceneDocument,
} from '@roomforge/core';
import {
  buildDocument,
  buildObject,
  createFakeClock,
  createSeqIdGen,
  type FakeClock,
} from '@roomforge/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

/** Test support: what every `ProjectRepository` must do, whatever it stores projects in. */
export interface ContractContext {
  repository: ProjectRepository;
  clock: FakeClock;
}

export const id = (value: string): ProjectId => ProjectIdSchema.parse(value);

/** The fixture scene with exactly `count` objects, so tests can tell which document came back. */
export function documentWith(count: number): SceneDocument {
  const objects = Array.from({ length: count }, (_, i) =>
    buildObject({ id: `obj-${i}`, transform: { position: [1 + i * 0.05, 0, 1], rotationY: 0 } }),
  );
  return {
    ...buildDocument(),
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    objectOrder: objects.map((object) => object.id),
  };
}

export function describeProjectRepository(
  label: string,
  create: (
    clock: FakeClock,
    nextId: () => string,
  ) => ProjectRepository | Promise<ProjectRepository>,
): void {
  describe(`${label} (ProjectRepository contract)`, () => {
    let context: ContractContext;

    beforeEach(async () => {
      const clock = createFakeClock(1_000);
      context = { clock, repository: await create(clock, createSeqIdGen('copy')) };
    });

    it('starts empty', async () => {
      expect(await context.repository.list()).toEqual([]);
      expect(await context.repository.get(id('nope'))).toBeUndefined();
    });

    it('saves a project and reads it back with its document', async () => {
      const { repository } = context;
      const document = documentWith(3);
      const saved = await repository.save({ id: id('p1'), name: 'Office', document });
      expect(saved).toEqual({ id: 'p1', name: 'Office', createdAt: 1_000, updatedAt: 1_000 });
      expect(await repository.get(id('p1'))).toEqual({ ...saved, document });
      expect(await repository.list()).toEqual([saved]);
    });

    it('does not put the document in the list', async () => {
      await context.repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
      const [summary] = await context.repository.list();
      expect(Object.keys(summary ?? {}).sort()).toEqual(['createdAt', 'id', 'name', 'updatedAt']);
    });

    it('saving again replaces the document and name but keeps createdAt', async () => {
      const { repository, clock } = context;
      await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
      clock.advance(500);
      const second = documentWith(2);
      const saved = await repository.save({ id: id('p1'), name: 'Office v2', document: second });
      expect(saved).toEqual({ id: 'p1', name: 'Office v2', createdAt: 1_000, updatedAt: 1_500 });
      expect((await repository.get(id('p1')))?.document).toEqual(second);
      expect(await repository.list()).toHaveLength(1);
    });

    it('trims the name and refuses an empty or too long one, saving nothing', async () => {
      const { repository } = context;
      const saved = await repository.save({
        id: id('p1'),
        name: '  Office  ',
        document: documentWith(0),
      });
      expect(saved.name).toBe('Office');
      for (const name of ['', '   ', 'x'.repeat(LIMITS.maxNameLength + 1)]) {
        await expect(
          repository.save({ id: id('p2'), name, document: documentWith(0) }),
        ).rejects.toMatchObject({ code: 'INVALID_NAME' });
      }
      expect((await repository.list()).map((p) => p.id)).toEqual(['p1']);
    });

    it('lists the most recently changed project first', async () => {
      const { repository, clock } = context;
      await repository.save({ id: id('a'), name: 'A', document: documentWith(0) });
      clock.advance(10);
      await repository.save({ id: id('b'), name: 'B', document: documentWith(0) });
      clock.advance(10);
      await repository.save({ id: id('c'), name: 'C', document: documentWith(0) });
      expect((await repository.list()).map((p) => p.id)).toEqual(['c', 'b', 'a']);
      clock.advance(10);
      await repository.save({ id: id('a'), name: 'A', document: documentWith(1) });
      expect((await repository.list()).map((p) => p.id)).toEqual(['a', 'c', 'b']);
    });

    it('breaks ties by creation date and then by id, always in the same order', async () => {
      const { repository } = context;
      await repository.save({ id: id('b'), name: 'B', document: documentWith(0) });
      await repository.save({ id: id('a'), name: 'A', document: documentWith(0) });
      await repository.save({ id: id('c'), name: 'C', document: documentWith(0) });
      expect((await repository.list()).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });

    it('renames, bumping updatedAt and leaving the document alone', async () => {
      const { repository, clock } = context;
      const document = documentWith(2);
      await repository.save({ id: id('p1'), name: 'Office', document });
      clock.advance(40);
      expect(await repository.rename(id('p1'), '  Gaming room ')).toEqual({
        id: 'p1',
        name: 'Gaming room',
        createdAt: 1_000,
        updatedAt: 1_040,
      });
      const stored = await repository.get(id('p1'));
      expect(stored?.name).toBe('Gaming room');
      expect(stored?.document).toEqual(document);
    });

    it('renaming what is not there, or to a bad name, fails with a typed error', async () => {
      const { repository } = context;
      await expect(repository.rename(id('ghost'), 'x')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await repository.save({ id: id('p1'), name: 'Office', document: documentWith(0) });
      await expect(repository.rename(id('p1'), ' ')).rejects.toMatchObject({
        code: 'INVALID_NAME',
      });
      expect((await repository.get(id('p1')))?.name).toBe('Office');
    });

    it('duplicates under a new id, with the same document and a "(copy)" name', async () => {
      const { repository, clock } = context;
      const document = documentWith(4);
      await repository.save({ id: id('p1'), name: 'Office', document });
      clock.advance(70);
      const copy = await repository.duplicate(id('p1'));
      expect(copy).toEqual({
        id: 'copy-1',
        name: 'Office (copy)',
        createdAt: 1_070,
        updatedAt: 1_070,
      });
      expect((await repository.get(id('copy-1')))?.document).toEqual(document);
      expect((await repository.list()).map((p) => p.id)).toEqual(['copy-1', 'p1']);
    });

    it('a copy is independent of its original', async () => {
      const { repository } = context;
      await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
      const copy = await repository.duplicate(id('p1'), 'Experiment');
      expect(copy.name).toBe('Experiment');
      await repository.save({ id: copy.id, name: 'Experiment', document: documentWith(5) });
      expect(Object.keys((await repository.get(id('p1')))?.document.objects ?? {})).toHaveLength(1);
      await repository.delete(id('p1'));
      expect(await repository.get(copy.id)).toBeDefined();
    });

    it('duplicating what is not there fails with NOT_FOUND', async () => {
      await expect(context.repository.duplicate(id('ghost'))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await context.repository.list()).toEqual([]);
    });

    it('deletes the project and its document; deleting what is not there is fine', async () => {
      const { repository } = context;
      await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
      await repository.save({ id: id('p2'), name: 'Other', document: documentWith(1) });
      await repository.delete(id('p1'));
      expect(await repository.get(id('p1'))).toBeUndefined();
      expect((await repository.list()).map((p) => p.id)).toEqual(['p2']);
      await expect(repository.delete(id('p1'))).resolves.toBeUndefined();
      await expect(repository.delete(id('never'))).resolves.toBeUndefined();
    });

    it('a stored document is a copy: changing the original afterwards does not reach it', async () => {
      const { repository } = context;
      const document = documentWith(1);
      await repository.save({ id: id('p1'), name: 'Office', document });
      document.objectOrder.push('later' as never);
      const stored = await repository.get(id('p1'));
      expect(stored?.document.objectOrder).not.toContain('later');
    });

    it('keeps a catalog id it has never heard of (invariant I6)', async () => {
      const { repository } = context;
      const document = documentWith(1);
      const first = Object.values(document.objects)[0];
      if (first) first.catalogId = 'from.the.future.v9';
      await repository.save({ id: id('p1'), name: 'Office', document });
      const back = (await repository.get(id('p1')))?.document;
      expect(Object.values(back?.objects ?? {})[0]?.catalogId).toBe('from.the.future.v9');
    });

    it('does not trust __proto__-looking names or ids (they are plain keys)', async () => {
      const { repository } = context;
      const saved = await repository.save({
        id: id('p1'),
        name: '__proto__',
        document: documentWith(0),
      });
      expect(saved.name).toBe('__proto__');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('answers concurrent saves of different projects without losing any', async () => {
      const { repository } = context;
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          repository.save({ id: id(`p${i}`), name: `P${i}`, document: documentWith(i % 3) }),
        ),
      );
      expect(await repository.list()).toHaveLength(12);
    });

    it('answers concurrent saves of one project with one of them, whole', async () => {
      const { repository } = context;
      await Promise.all(
        [1, 2, 3, 4].map((n) =>
          repository.save({ id: id('p1'), name: `Version ${n}`, document: documentWith(n) }),
        ),
      );
      const stored = await repository.get(id('p1'));
      const version = Number(stored?.name.split(' ')[1]);
      expect(Object.keys(stored?.document.objects ?? {})).toHaveLength(version);
    });
  });
}

/** A document that no database can store (it holds a function): for testing failed writes. */
export function unstorable(document: SceneDocument): SceneDocument {
  return { ...document, poison: () => 1 } as SceneDocument;
}
