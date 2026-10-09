import { type ImportError, RepositoryError } from '@roomforge/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectUnavailable } from './project-unavailable';

const importError = (code: ImportError['code']): ImportError => ({
  code,
  message: `raw ${code}`,
  details: [],
});

describe('ProjectUnavailable', () => {
  it('says there is no such project, with a way back to the projects', () => {
    render(<ProjectUnavailable reason={{ kind: 'not-found' }} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'This project cannot be opened' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('There is no project with that address');
    expect(
      screen.getByRole('link', { name: 'Back to your projects' }).getAttribute('href'),
    ).toMatch(/^\/projects\/?$/);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('explains a project it cannot read, and says nothing was changed', () => {
    render(
      <ProjectUnavailable
        reason={{ kind: 'unreadable', import: importError('INVALID_DOCUMENT') }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('scene inside this file is not valid');
    expect(screen.getByText(/Nothing was changed/)).toBeInTheDocument();
  });

  it('a project from a newer version says to update, not that it is broken', () => {
    render(
      <ProjectUnavailable reason={{ kind: 'unreadable', import: importError('NEWER_VERSION') }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Update RoomForge');
    expect(screen.queryByText(/Nothing was changed/)).toBeNull();
  });

  it('a storage failure says why, and can be tried again', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ProjectUnavailable
        reason={{ kind: 'storage', error: new RepositoryError('UNAVAILABLE', 'x') }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The browser does not allow storing projects here.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
