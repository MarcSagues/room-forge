import {
  checkInvariants,
  LIMITS,
  type ProjectId,
  ProjectIdSchema,
  RepositoryError,
} from '@roomforge/core';
import { arbitraryDocument, buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryProjectRepository } from './memory-repository';
import {
  downloadFile,
  exportFileName,
  exportProject,
  REVOKE_AFTER_MS,
  readProjectFile,
  slugify,
} from './project-files';

const pid = (value: string): ProjectId => ProjectIdSchema.parse(value);
const fileOf = (text: string, name = 'x.roomforge.json') => new File([text], name);

describe('slugify', () => {
  it.each([
    ['Gaming Room!', 'gaming-room'],
    ['Despacho de Zoë', 'despacho-de-zoe'],
    ['  --Office__2--  ', 'office-2'],
    ['a/b\\c', 'a-b-c'],
    ['../../etc/passwd', 'etc-passwd'],
    ['CON', 'con'],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it.each(['', '   ', '🎮🎮', '---', '...'])('falls back to "project" for %j', (name) => {
    expect(slugify(name)).toBe('project');
  });

  it('cuts a long name without leaving a dash at the end', () => {
    const slug = slugify(`${'a'.repeat(39)} ${'b'.repeat(30)}`);
    expect(slug).toBe('a'.repeat(39));
    expect(slug.length).toBeLessThanOrEqual(40);
  });

  it('only ever produces lowercase letters, digits and single dashes', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (name) => {
        expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      }),
    );
  });
});

describe('exportFileName', () => {
  it('is slug-date.roomforge.json, with the date on the calendar of the person exporting', () => {
    expect(exportFileName('Gaming room', new Date(2026, 9, 9, 23, 59))).toBe(
      'gaming-room-2026-10-09.roomforge.json',
    );
    expect(exportFileName('Office', new Date(2026, 0, 5, 0, 1))).toBe(
      'office-2026-01-05.roomforge.json',
    );
  });
});

describe('exportProject', () => {
  it('serializes the saved project into the project file format', async () => {
    const repository = createMemoryProjectRepository();
    const document = buildDocument();
    await repository.save({ id: pid('p1'), name: 'Gaming room', document });
    const file = await exportProject(repository, pid('p1'), {
      appVersion: '1.2.3',
      now: () => new Date(Date.UTC(2026, 9, 9, 12, 0, 0)),
    });
    expect(file.filename).toMatch(/^gaming-room-2026-10-\d\d\.roomforge\.json$/);
    const parsed = JSON.parse(file.text);
    expect(parsed).toMatchObject({
      format: 'roomforge-scene',
      formatVersion: 1,
      appVersion: '1.2.3',
      exportedAt: '2026-10-09T12:00:00.000Z',
      project: { name: 'Gaming room' },
    });
    expect(parsed.document).toEqual(document);
  });

  it('fails with NOT_FOUND for a project that is not there', async () => {
    const repository = createMemoryProjectRepository();
    const attempt = exportProject(repository, pid('ghost'), { appVersion: 'x' });
    await expect(attempt).rejects.toBeInstanceOf(RepositoryError);
    await expect(attempt).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('readProjectFile', () => {
  async function exported(name = 'Office') {
    const repository = createMemoryProjectRepository();
    await repository.save({ id: pid('p1'), name, document: buildDocument() });
    return exportProject(repository, pid('p1'), { appVersion: 'test' });
  }

  it('opens what was exported: the same name and the same document, deeply', async () => {
    const file = await exported('Gaming room');
    const result = await readProjectFile(fileOf(file.text));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Gaming room');
    expect(result.value.document).toEqual(buildDocument());
    expect(result.value.appVersion).toBe('test');
  });

  it('round-trips any valid document (property)', async () => {
    const catalog = createFixtureCatalog();
    await fc.assert(
      fc.asyncProperty(arbitraryDocument(), async (document) => {
        // The generator guarantees the schema, not every rule of a scene (such as stacking depth).
        fc.pre(checkInvariants(document, catalog).length === 0);
        const repository = createMemoryProjectRepository();
        await repository.save({ id: pid('p1'), name: 'Any', document });
        const file = await exportProject(repository, pid('p1'), { appVersion: 'test' });
        const result = await readProjectFile(fileOf(file.text), { catalog });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.document).toEqual(document);
      }),
      { numRuns: 25 },
    );
  });

  it('lists the catalog ids that the given catalog does not know', async () => {
    const file = await exported();
    const withoutCatalog = await readProjectFile(fileOf(file.text));
    expect(withoutCatalog.ok && withoutCatalog.value.unknownCatalogIds).toEqual([
      'desk.basic.120',
      'monitor.27',
    ]);
    const withCatalog = await readProjectFile(fileOf(file.text), {
      catalog: createFixtureCatalog(),
    });
    expect(withCatalog.ok && withCatalog.value.unknownCatalogIds).toEqual([]);
  });

  it('refuses a file over the size limit without reading it', async () => {
    let read = false;
    const huge = {
      size: LIMITS.maxImportBytes + 1,
      text: async () => {
        read = true;
        return '';
      },
    } as unknown as Blob;
    const result = await readProjectFile(huge);
    expect(result).toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } });
    expect(read).toBe(false);
  });

  it('reports what is not JSON, not a project, hostile or newer, each with its code', async () => {
    const envelope = (extra: string) =>
      `{"format":"roomforge-scene","formatVersion":1,"project":{"name":"x"},${extra}}`;
    const cases: Array<[string, string]> = [
      ['{ not json', 'INVALID_JSON'],
      ['', 'INVALID_JSON'],
      ['[1,2,3]', 'NOT_A_PROJECT'],
      ['{"format":"something-else","formatVersion":1}', 'NOT_A_PROJECT'],
      [
        '{"format":"roomforge-scene","formatVersion":99,"project":{"name":"x"},"document":{}}',
        'NEWER_VERSION',
      ],
      [envelope('"document":{"schemaVersion":1,"__proto__":{"a":1}}'), 'HOSTILE_INPUT'],
      [envelope('"document":{"schemaVersion":1}'), 'INVALID_DOCUMENT'],
    ];
    for (const [text, code] of cases) {
      const result = await readProjectFile(fileOf(text));
      expect(result, text).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('a file that cannot even be read is a failure, not an exception', async () => {
    const broken = {
      size: 10,
      text: async () => {
        throw new Error('disk gone');
      },
    } as unknown as Blob;
    expect(await readProjectFile(broken)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_JSON' },
    });
  });
});

describe('downloadFile', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands the browser a download with the right name and content, then cleans up', async () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const revoked: string[] = [];
    const clicks: Array<{ href: string; download: string }> = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      created.push(blob as Blob);
      return 'blob:fake-1';
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download });
    };
    try {
      downloadFile({ filename: 'office-2026-10-09.roomforge.json', text: '{"a":1}' });
      expect(clicks).toEqual([
        { href: 'blob:fake-1', download: 'office-2026-10-09.roomforge.json' },
      ]);
      expect(created).toHaveLength(1);
      expect(created[0]?.type).toBe('application/json');
      expect(await created[0]?.text()).toBe('{"a":1}');
      expect(revoked).toEqual([]);
      vi.advanceTimersByTime(REVOKE_AFTER_MS);
      expect(revoked).toEqual(['blob:fake-1']);
      expect(document.querySelector('a[download]')).toBeNull();
    } finally {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      HTMLAnchorElement.prototype.click = realClick;
    }
  });
});
