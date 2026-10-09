import { type ProjectSummary, RepositoryError } from '@roomforge/core';
import { buildDocument, createSeqIdGen } from '@roomforge/core/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsScreen } from './projects-screen';
import { DAY, fakeRepository, NOON, summary } from './testing/fake-repository';

function setup(
  initial: ProjectSummary[] = [],
  props: Partial<React.ComponentProps<typeof ProjectsScreen>> = {},
) {
  const fake = fakeRepository(initial);
  const createDocument = vi.fn(() => buildDocument());
  const generateId = createSeqIdGen('new');
  const view = render(
    <ProjectsScreen
      repository={fake.repository}
      createDocument={createDocument}
      generateId={generateId}
      storage="indexeddb"
      {...props}
    />,
  );
  return { ...fake, createDocument, ...view };
}

const names = () =>
  within(screen.getByRole('list', { name: 'Your projects' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('heading').textContent);

afterEach(() => {
  vi.useRealTimers();
});

describe('ProjectsScreen: the list', () => {
  it('says it is loading, then lists the projects in the repository’s order with their dates', async () => {
    setup([summary('a', 'Office', NOON), summary('b', 'Bedroom', NOON + DAY)]);
    expect(screen.getByText('Loading your projects…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Your projects' });
    expect(names()).toEqual(['Bedroom', 'Office']);
    const office = screen.getByRole('heading', { name: 'Office' }).closest('li');
    expect(office).toHaveTextContent('Edited');
    expect(office).toHaveTextContent('2026');
  });

  it('shows the empty state, with a way to start, when there are no projects', async () => {
    setup([]);
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText(/Start with a new room/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your projects' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBeGreaterThan(0);
  });

  it('every action names its project, for people who navigate by button', async () => {
    setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    expect(screen.getByRole('link', { name: 'Open Office' })).toHaveAttribute(
      'href',
      expect.stringContaining('project=a'),
    );
    for (const name of ['Rename Office', 'Duplicate Office', 'Delete Office']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('opens projects where openHref says', async () => {
    setup([summary('a', 'Office')], { openHref: (id) => `/somewhere/${id}/` });
    // next/link only appends the trailing slash configured in next.config.ts at build time.
    expect((await screen.findByRole('link', { name: 'Open Office' })).getAttribute('href')).toMatch(
      /^\/somewhere\/a\/?$/,
    );
  });
});

describe('ProjectsScreen: search', () => {
  it('filters by name, ignoring case and surrounding spaces, and says when nothing matches', async () => {
    const user = userEvent.setup();
    setup([summary('a', 'Gaming room'), summary('b', 'Office'), summary('c', 'Game night')]);
    await screen.findByRole('list', { name: 'Your projects' });
    const search = screen.getByRole('searchbox', { name: 'Search projects' });
    await user.type(search, '  GAM ');
    expect(names().sort()).toEqual(['Game night', 'Gaming room']);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No project matches “zzz”.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your projects' })).not.toBeInTheDocument();
    await user.clear(search);
    expect(names()).toHaveLength(3);
  });

  it('ignores accents, so that “despacho” finds “Despacho de Zoë” and “Cocina” finds “Cócina”', async () => {
    const user = userEvent.setup();
    setup([summary('a', 'Despacho de Zoë'), summary('b', 'Cócina')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'cocina');
    expect(names()).toEqual(['Cócina']);
  });
});

describe('ProjectsScreen: new project', () => {
  it('saves a project with a starter document, a free name and a new id, and shows it', async () => {
    const user = userEvent.setup();
    const { repository, createDocument } = setup([summary('a', 'Untitled project')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(1));
    expect(createDocument).toHaveBeenCalledTimes(1);
    const input = repository.save.mock.calls[0]?.[0];
    expect(input?.name).toBe('Untitled project 2');
    expect(input?.id).toBe('new-1');
    expect(await screen.findByRole('heading', { name: 'Untitled project 2' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Created “Untitled project 2”.');
  });

  it('works from the empty state too', async () => {
    const user = userEvent.setup();
    const { repository } = setup([]);
    await screen.findByText('No projects yet');
    await user.click(screen.getAllByRole('button', { name: 'New project' })[0] as HTMLElement);
    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Untitled project' })).toBeInTheDocument();
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
  });

  it('clears the search so the new project can be seen', async () => {
    const user = userEvent.setup();
    setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'office');
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(await screen.findByRole('heading', { name: 'Untitled project' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search projects' })).toHaveValue('');
  });
});

describe('ProjectsScreen: rename', () => {
  it('renames with Enter and keeps the focus on the rename button', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    const field = screen.getByRole('textbox', { name: 'Project name' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Office');
    await user.clear(field);
    await user.type(field, '  Gaming room {Enter}');
    expect(repository.rename).toHaveBeenCalledWith('a', 'Gaming room');
    expect(await screen.findByRole('heading', { name: 'Gaming room' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Renamed to “Gaming room”.');
    expect(screen.getByRole('button', { name: 'Rename Gaming room' })).toHaveFocus();
  });

  it('renames with the Save button, and Cancel leaves the name alone', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' 2');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(repository.rename).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Office' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Office 2' })).toBeInTheDocument();
  });

  it('Escape cancels', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    await user.keyboard('xyz{Escape}');
    expect(repository.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Office' })).toHaveFocus();
  });

  it('keeps editing and explains when the name is not valid', async () => {
    const user = userEvent.setup();
    setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    await user.clear(screen.getByRole('textbox', { name: 'Project name' }));
    await user.keyboard('{Enter}');
    const field = await screen.findByRole('textbox', { name: 'Project name' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Use a name of 1 to 80 characters.');
    expect(field).toHaveFocus();
    await user.type(field, 'Study{Enter}');
    expect(await screen.findByRole('heading', { name: 'Study' })).toBeInTheDocument();
  });

  it('does not call the repository when the name did not change', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Rename Office' }));
    await user.keyboard('{Enter}');
    expect(repository.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument();
  });
});

describe('ProjectsScreen: duplicate', () => {
  it('adds the copy and announces it', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Duplicate Office' }));
    expect(repository.duplicate).toHaveBeenCalledWith('a');
    expect(await screen.findByRole('heading', { name: 'Office (copy)' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Created “Office (copy)”.');
    expect(names()).toEqual(['Office (copy)', 'Office']);
  });
});

describe('ProjectsScreen: delete, with a way back', () => {
  async function delayed(initial = [summary('a', 'Office'), summary('b', 'Bedroom', NOON + DAY)]) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const context = setup(initial);
    await screen.findByRole('list', { name: 'Your projects' });
    return { user, ...context };
  }

  it('takes the project off the list at once, but only deletes it after 8 seconds', async () => {
    const { user, repository } = await delayed();
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    expect(names()).toEqual(['Bedroom']);
    expect(screen.getByRole('status')).toHaveTextContent('“Office” was deleted.');
    expect(repository.delete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    expect(repository.delete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    await waitFor(() => expect(repository.delete).toHaveBeenCalledWith('a'));
    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(names()).toEqual(['Bedroom']);
    await waitFor(() =>
      expect(screen.queryByText('“Office” was deleted.')).not.toBeInTheDocument(),
    );
  });

  it('Undo within the 8 seconds brings it back and it is never deleted', async () => {
    const { user, repository } = await delayed();
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    await user.click(screen.getByRole('button', { name: 'Undo deleting Office' }));
    expect(names().sort()).toEqual(['Bedroom', 'Office']);
    expect(screen.getByRole('status')).toHaveTextContent('“Office” was restored.');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('keeps each pending deletion on its own clock', async () => {
    const { user, repository } = await delayed();
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    await user.click(screen.getByRole('button', { name: 'Delete Bedroom' }));
    expect(screen.queryByRole('list', { name: 'Your projects' })).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4_100);
    });
    await waitFor(() => expect(repository.delete).toHaveBeenCalledWith('a'));
    expect(repository.delete).not.toHaveBeenCalledWith('b');
    await user.click(screen.getByRole('button', { name: 'Undo deleting Bedroom' }));
    expect(names()).toEqual(['Bedroom']);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(repository.delete).toHaveBeenCalledTimes(1);
  });

  it('leaving the screen deletes what was waiting, so that a delete is never lost', async () => {
    const { user, repository, unmount } = await delayed();
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    unmount();
    expect(repository.delete).toHaveBeenCalledWith('a');
  });

  it('puts the project back and says why when the deletion fails', async () => {
    const { user, repository } = await delayed();
    repository.delete.mockRejectedValueOnce(new RepositoryError('FAILED', 'nope'));
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(names().sort()).toEqual(['Bedroom', 'Office']);
  });

  it('moves the focus to the list, so that the keyboard is not left on a button that is gone', async () => {
    const { user } = await delayed();
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    expect(screen.getByRole('region', { name: 'Your projects' })).toHaveFocus();
  });

  it('an undo window of another length is honoured', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { repository } = setup([summary('a', 'Office')], { undoMs: 1_000 });
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'Delete Office' }));
    act(() => {
      vi.advanceTimersByTime(1_100);
    });
    await waitFor(() => expect(repository.delete).toHaveBeenCalled());
  });
});

describe('ProjectsScreen: when storage fails', () => {
  it('explains a failed load by its code, and tries again', async () => {
    const user = userEvent.setup();
    const fake = fakeRepository([summary('a', 'Office')]);
    fake.repository.list.mockRejectedValueOnce(new RepositoryError('QUOTA_EXCEEDED', 'full'));
    render(
      <ProjectsScreen
        repository={fake.repository}
        createDocument={() => buildDocument()}
        storage="indexeddb"
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The browser has no storage left. Free some space and try again.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Office' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['BLOCKED', 'Another tab is using an older version of RoomForge. Close it and try again.'],
    ['VERSION_ERROR', 'Your projects were saved by a newer version of RoomForge. Update the app.'],
    ['UNAVAILABLE', 'The browser does not allow storing projects here.'],
    ['NOT_FOUND', 'That project no longer exists.'],
    ['FAILED', 'Something went wrong. Try again.'],
  ] as const)('a %s failure has its own message', async (code, message) => {
    const fake = fakeRepository();
    fake.repository.list.mockRejectedValueOnce(new RepositoryError(code, 'x'));
    render(
      <ProjectsScreen
        repository={fake.repository}
        createDocument={() => buildDocument()}
        storage="indexeddb"
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('a failure that is not a RepositoryError is a generic one', async () => {
    const fake = fakeRepository();
    fake.repository.list.mockRejectedValueOnce(new TypeError('boom'));
    render(
      <ProjectsScreen
        repository={fake.repository}
        createDocument={() => buildDocument()}
        storage="indexeddb"
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('a failed creation says so and leaves the list as it was', async () => {
    const user = userEvent.setup();
    const { repository } = setup([summary('a', 'Office')]);
    repository.save.mockRejectedValueOnce(new RepositoryError('QUOTA_EXCEEDED', 'full'));
    await screen.findByRole('list', { name: 'Your projects' });
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no storage left');
    expect(names()).toEqual(['Office']);
  });

  it('tells the person, up front, when projects only live in memory', async () => {
    setup([], { storage: 'memory' });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('kept only until you close this tab');
    expect(notice).toHaveTextContent('leave private mode');
  });

  it('says nothing about storage when it works', async () => {
    setup([summary('a', 'Office')]);
    await screen.findByRole('list', { name: 'Your projects' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
