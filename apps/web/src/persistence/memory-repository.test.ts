import { describe, expect, it } from 'vitest';
import { createMemoryProjectRepository } from './memory-repository';
import { describeProjectRepository, documentWith, id, unstorable } from './testing/contract';

describeProjectRepository('memory repository', (clock, nextId) =>
  createMemoryProjectRepository({ clock, idGen: nextId }),
);

describe('memory repository', () => {
  it('refuses a document that cannot be copied, and keeps what it had', async () => {
    const repository = createMemoryProjectRepository();
    const good = documentWith(1);
    await repository.save({ id: id('p1'), name: 'Office', document: good });
    const bad = unstorable(documentWith(2));
    await expect(
      repository.save({ id: id('p1'), name: 'Changed', document: bad }),
    ).rejects.toMatchObject({ code: 'FAILED' });
    const stored = await repository.get(id('p1'));
    expect(stored?.name).toBe('Office');
    expect(stored?.document).toEqual(good);
  });

  it('what get returns is a copy: changing it does not change the project', async () => {
    const repository = createMemoryProjectRepository();
    await repository.save({ id: id('p1'), name: 'Office', document: documentWith(1) });
    const first = await repository.get(id('p1'));
    first?.document.objectOrder.push('x' as never);
    expect((await repository.get(id('p1')))?.document.objectOrder).toHaveLength(1);
  });
});
