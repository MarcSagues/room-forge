import {
  type ImportError,
  type ImportErrorCode,
  type ParsedProject,
  RepositoryError,
  type Result,
} from '@roomforge/core';
import { buildDocument, createSeqIdGen } from '@roomforge/core/testing';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFiles } from './project-files';
import { ProjectsScreen } from './projects-screen';
import { fakeRepository, summary } from './testing/fake-repository';

const parsed = (over: Partial<ParsedProject> = {}): ParsedProject => ({
  name: 'Imported room',
  document: buildDocument(),
  unknownCatalogIds: [],
  appVersion: '0.1.0',
  exportedAt: '2026-03-10T12:00:00.000Z',
  ...over,
});

const failure = (
  code: ImportErrorCode,
  over: Partial<ImportError> = {},
): Result<never, ImportError> => ({
  ok: false,
  error: { code, message: `raw ${code}`, details: [], ...over },
});

function setup(
  result: Result<ParsedProject, ImportError> = { ok: true, value: parsed() },
  initial = [summary('a', 'Office')],
) {
  const fake = fakeRepository(initial);
  const files = {
    exportProject: vi.fn(async () => {}),
    readFile: vi.fn(async () => result),
  } satisfies ProjectFiles;
  const view = render(
    <ProjectsScreen
      repository={fake.repository}
      createDocument={() => buildDocument()}
      generateId={createSeqIdGen('new')}
      storage="indexeddb"
      files={files}
    />,
  );
  const fileInput = () => view.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { ...fake, files, fileInput, ...view };
}

const projectFile = (name = 'room.roomforge.json') =>
  new File(['{}'], name, { type: 'application/json' });
const names = () =>
  within(screen.getByRole('list', { name: 'Your projects' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('heading').textContent);

async function importFile(user: ReturnType<typeof userEvent.setup>, input: HTMLInputElement) {
  await screen.findByRole('list', { name: 'Your projects' });
  await user.upload(input, projectFile());
  return screen.findByRole('dialog');
}

describe('ProjectsScreen without file support', () => {
  it('has no import and no export when the app gives it no files', async () => {
    const fake = fakeRepository([summary('a', 'Office')]);
    render(
      <ProjectsScreen
        repository={fake.repository}
        createDocument={() => buildDocument()}
        storage="indexeddb"
      />,
    );
    await screen.findByRole('list', { name: 'Your projects' });
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export Office' })).not.toBeInTheDocument();
  });
});

describe('ProjectsScreen: export', () => {
  it('exports the project of the card and announces it', async () => {
    const user = userEvent.setup();
    const { files } = setup();
    await user.click(await screen.findByRole('button', { name: 'Export Office' }));
    expect(files.exportProject).toHaveBeenCalledWith('a');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Exported “Office”.'));
  });

  it('says so when the export fails, and keeps working', async () => {
    const user = userEvent.setup();
    const { files } = setup();
    files.exportProject.mockRejectedValueOnce(new RepositoryError('NOT_FOUND', 'gone'));
    await user.click(await screen.findByRole('button', { name: 'Export Office' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That project no longer exists.');
    expect(names()).toEqual(['Office']);
  });
});

describe('ProjectsScreen: import', () => {
  it('opens the file chooser from the Import button', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup();
    await screen.findByRole('list', { name: 'Your projects' });
    const click = vi.spyOn(fileInput(), 'click');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(fileInput().accept).toContain('.json');
  });

  it('shows what is in the file before anything is saved', async () => {
    const user = userEvent.setup();
    const { files, fileInput, repository } = setup();
    const dialog = await importFile(user, fileInput());
    expect(files.readFile).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('heading', { name: 'Import a project' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Name of the new project' })).toHaveValue(
      'Imported room',
    );
    const rooms = within(dialog).getByText('Rooms').nextElementSibling;
    const objects = within(dialog).getByText('Objects').nextElementSibling;
    expect(rooms).toHaveTextContent('1');
    expect(objects).toHaveTextContent('2');
    expect(dialog).toHaveTextContent('Written by RoomForge 0.1.0');
    expect(dialog).toHaveTextContent('Your existing projects are not changed.');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('saves it as a new project, with a new id and the file’s document, and lists it', async () => {
    const user = userEvent.setup();
    const value = parsed();
    const { fileInput, repository } = setup({ ok: true, value });
    const dialog = await importFile(user, fileInput());
    await user.click(within(dialog).getByRole('button', { name: 'Import as new project' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
    const saved = repository.save.mock.calls[0]?.[0];
    expect(saved).toMatchObject({ id: 'new-1', name: 'Imported room' });
    expect(saved?.document).toEqual(value.document);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(names().sort()).toEqual(['Imported room', 'Office']);
    expect(screen.getByRole('status')).toHaveTextContent('Imported “Imported room”.');
  });

  it('never overwrites: a name that is taken gets a number and the other project is untouched', async () => {
    const user = userEvent.setup();
    const { fileInput, repository } = setup(undefined, [summary('a', 'Imported room')]);
    const dialog = await importFile(user, fileInput());
    expect(within(dialog).getByRole('textbox', { name: 'Name of the new project' })).toHaveValue(
      'Imported room 2',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Import as new project' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    expect(repository.save.mock.calls[0]?.[0].id).not.toBe('a');
    expect(repository.rename).not.toHaveBeenCalled();
    await waitFor(() => expect(names().sort()).toEqual(['Imported room', 'Imported room 2']));
  });

  it('uses the untitled name when the file has none', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup({ ok: true, value: parsed({ name: '' }) });
    const dialog = await importFile(user, fileInput());
    expect(within(dialog).getByRole('textbox', { name: 'Name of the new project' })).toHaveValue(
      'Untitled project',
    );
  });

  it('lets the person rename it first, and explains a name that is not valid', async () => {
    const user = userEvent.setup();
    const { fileInput, repository } = setup();
    const dialog = await importFile(user, fileInput());
    const field = within(dialog).getByRole('textbox', { name: 'Name of the new project' });
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Import as new project' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Use a name of 1 to 80 characters.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(field, 'My copy');
    await user.click(within(dialog).getByRole('button', { name: 'Import as new project' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
    expect(repository.save.mock.calls[1]?.[0].name).toBe('My copy');
  });

  it('Cancel and Escape save nothing', async () => {
    const user = userEvent.setup();
    const { fileInput, repository } = setup();
    const dialog = await importFile(user, fileInput());
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await importFile(user, fileInput());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(repository.save).not.toHaveBeenCalled();
    expect(names()).toEqual(['Office']);
  });

  it('warns about catalog items it does not know, naming them', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup({
      ok: true,
      value: parsed({ unknownCatalogIds: ['lamp.future.9', 'desk.alien'] }),
    });
    const dialog = await importFile(user, fileInput());
    expect(dialog).toHaveTextContent('placeholders');
    expect(dialog).toHaveTextContent('lamp.future.9');
    expect(dialog).toHaveTextContent('desk.alien');
  });

  it('does not warn when every item is known', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup();
    const dialog = await importFile(user, fileInput());
    expect(dialog).not.toHaveTextContent('placeholders');
  });

  it('says when the file had to be brought up to date', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup({ ok: true, value: parsed({ migratedFrom: 0 }) });
    const dialog = await importFile(user, fileInput());
    expect(dialog).toHaveTextContent('older format and has been updated');
  });

  it('says it is reading while the file is being checked', async () => {
    const user = userEvent.setup();
    let release: (value: Result<ParsedProject, ImportError>) => void = () => {};
    const { files, fileInput } = setup();
    files.readFile.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    await screen.findByRole('list', { name: 'Your projects' });
    await user.upload(fileInput(), projectFile('big.roomforge.json'));
    expect(await screen.findByText('Reading big.roomforge.json…')).toBeInTheDocument();
    release({ ok: true, value: parsed() });
    expect(
      await screen.findByRole('button', { name: 'Import as new project' }),
    ).toBeInTheDocument();
  });

  it('the file can be picked again after cancelling (the same file, too)', async () => {
    const user = userEvent.setup();
    const { fileInput, files } = setup();
    const dialog = await importFile(user, fileInput());
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fileInput().value).toBe('');
    await importFile(user, fileInput());
    expect(files.readFile).toHaveBeenCalledTimes(2);
  });
});

describe('ProjectsScreen: files that cannot be imported', () => {
  const cases: Array<[ImportErrorCode, RegExp]> = [
    ['TOO_LARGE', /larger than 5 MB/],
    ['INVALID_JSON', /not valid JSON/],
    ['HOSTILE_INPUT', /refuses to open/],
    ['NOT_A_PROJECT', /not a RoomForge project file/],
    ['NEWER_VERSION', /Update RoomForge/],
    ['INVALID_VERSION', /which version of RoomForge wrote it/],
    ['MIGRATION_FAILED', /could not be brought up to date/],
    ['INVALID_DOCUMENT', /scene inside this file is not valid/],
    ['INVARIANT_VIOLATION', /breaks the rules of a valid room/],
  ];

  it.each(cases)(
    '%s has its own message, saves nothing and changes no project',
    async (code, message) => {
      const user = userEvent.setup();
      const { fileInput, repository } = setup(failure(code));
      const dialog = await importFile(user, fileInput());
      expect(dialog).toHaveTextContent(message);
      expect(dialog).toHaveTextContent('Your projects were not changed.');
      expect(within(dialog).queryByRole('button', { name: 'Import as new project' })).toBeNull();
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(repository.save).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
      expect(names()).toEqual(['Office']);
    },
  );

  it('a file from a newer version says which versions, and does not crash', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup(failure('NEWER_VERSION', { found: 7, supported: 1 }));
    const dialog = await importFile(user, fileInput());
    expect(dialog).toHaveTextContent('Update RoomForge to open it');
    expect(dialog).toHaveTextContent('File version 7; this version reads up to 1.');
  });

  it('lets the person see the technical details, never more than a few lines', async () => {
    const user = userEvent.setup();
    const details = Array.from({ length: 30 }, (_, i) => `objects.o${i}.catalogId: bad`);
    const { fileInput } = setup(failure('INVALID_DOCUMENT', { details }));
    const dialog = await importFile(user, fileInput());
    await user.click(within(dialog).getByText('Technical details'));
    expect(within(dialog).getAllByRole('listitem').length).toBeLessThanOrEqual(8);
    expect(dialog).toHaveTextContent('objects.o0.catalogId: bad');
  });

  it('has no details section when there are no details', async () => {
    const user = userEvent.setup();
    const { fileInput } = setup(failure('INVALID_JSON'));
    const dialog = await importFile(user, fileInput());
    expect(within(dialog).queryByText('Technical details')).toBeNull();
  });
});

describe('ProjectsScreen: dropping a file on the window', () => {
  const dropOf = (file: File) => ({ dataTransfer: { files: [file], types: ['Files'] } });

  it('shows a hint while a file is dragged over, and hides it when it leaves', async () => {
    setup();
    await screen.findByRole('list', { name: 'Your projects' });
    fireEvent.dragEnter(document.body, { dataTransfer: { files: [], types: ['Files'] } });
    expect(screen.getByText('Drop a RoomForge project file to import it')).toBeInTheDocument();
    fireEvent.dragLeave(document.body, { dataTransfer: { files: [], types: ['Files'] } });
    expect(screen.queryByText('Drop a RoomForge project file to import it')).toBeNull();
  });

  it('opens the dropped file the same way as a chosen one', async () => {
    const { files } = setup();
    await screen.findByRole('list', { name: 'Your projects' });
    const file = projectFile('dropped.roomforge.json');
    fireEvent.dragEnter(document.body, dropOf(file));
    fireEvent.drop(document.body, dropOf(file));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(files.readFile).toHaveBeenCalledWith(file);
    expect(screen.queryByText('Drop a RoomForge project file to import it')).toBeNull();
  });

  it('lets the browser have what is not a file (text dragged around the page)', async () => {
    const { files } = setup();
    await screen.findByRole('list', { name: 'Your projects' });
    fireEvent.dragEnter(document.body, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(screen.queryByText('Drop a RoomForge project file to import it')).toBeNull();
    fireEvent.drop(document.body, { dataTransfer: { files: [], types: ['text/plain'] } });
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it('keeps the browser from opening the file itself, which would leave the page', async () => {
    setup();
    await screen.findByRole('list', { name: 'Your projects' });
    const over = new Event('dragover', { cancelable: true, bubbles: true });
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'], files: [] } });
    document.body.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it('ignores drops while another file is being looked at', async () => {
    const user = userEvent.setup();
    const { files, fileInput } = setup();
    await importFile(user, fileInput());
    fireEvent.drop(document.body, dropOf(projectFile('second.roomforge.json')));
    expect(files.readFile).toHaveBeenCalledTimes(1);
  });
});
