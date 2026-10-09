import {
  normalizeProjectName,
  type ProjectId,
  ProjectIdSchema,
  type ProjectRepository,
  type ProjectSummary,
  RepositoryError,
  type SceneDocument,
} from '@roomforge/core';
import { createSeqIdGen } from '@roomforge/core/testing';
import { vi } from 'vitest';

export const pid = (value: string): ProjectId => ProjectIdSchema.parse(value);
export const DAY = 24 * 60 * 60 * 1000;
// Noon UTC on 2026-03-10: the same calendar day in every time zone from -12 to +11.
export const NOON = Date.UTC(2026, 2, 10, 12);

export const summary = (id: string, name: string, updatedAt = NOON): ProjectSummary => ({
  id: pid(id),
  name,
  createdAt: updatedAt - DAY,
  updatedAt,
});

/** A repository in memory whose every method is a spy, so tests can see and break its calls. */
export function fakeRepository(initial: ProjectSummary[] = []) {
  const projects = new Map(initial.map((project) => [project.id as string, project]));
  let clock = NOON + 10 * DAY;
  const nextId = createSeqIdGen('copy');
  const newestFirst = () =>
    [...projects.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const repository = {
    list: vi.fn(async () => newestFirst().map((project) => ({ ...project }))),
    get: vi.fn(async () => undefined),
    save: vi.fn(async (input: { id: ProjectId; name: string; document: SceneDocument }) => {
      clock += 1000;
      const saved = {
        id: input.id,
        name: normalizeProjectName(input.name),
        createdAt: projects.get(input.id)?.createdAt ?? clock,
        updatedAt: clock,
      };
      projects.set(input.id, saved);
      return { ...saved };
    }),
    rename: vi.fn(async (id: ProjectId, name: string) => {
      const existing = projects.get(id);
      if (!existing) throw new RepositoryError('NOT_FOUND', 'gone');
      clock += 1000;
      const renamed = { ...existing, name: normalizeProjectName(name), updatedAt: clock };
      projects.set(id, renamed);
      return { ...renamed };
    }),
    duplicate: vi.fn(async (id: ProjectId) => {
      const existing = projects.get(id);
      if (!existing) throw new RepositoryError('NOT_FOUND', 'gone');
      clock += 1000;
      const copy = {
        id: pid(nextId()),
        name: `${existing.name} (copy)`,
        createdAt: clock,
        updatedAt: clock,
      };
      projects.set(copy.id, copy);
      return { ...copy };
    }),
    delete: vi.fn(async (id: ProjectId) => {
      projects.delete(id);
    }),
  } satisfies ProjectRepository;
  return { repository, projects };
}
