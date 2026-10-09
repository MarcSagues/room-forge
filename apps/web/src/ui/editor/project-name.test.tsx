import { RepositoryError } from '@roomforge/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectName } from './project-name';
import { ProjectStatusProvider } from './project-status';

function setup(onRename = vi.fn<(name: string) => Promise<void>>(async () => {})) {
  render(
    <ProjectStatusProvider name="Gaming room" save="saved" onRename={onRename}>
      <ProjectName />
      <button type="button">elsewhere</button>
    </ProjectStatusProvider>,
  );
  return { onRename, user: userEvent.setup() };
}

const nameButton = () => screen.getByRole('button', { name: 'Rename project: Gaming room' });
const field = () => screen.getByRole('textbox', { name: 'Project name' });

describe('ProjectName', () => {
  it('without a way to rename, is the link back to all the projects', () => {
    render(
      <ProjectStatusProvider name="Gaming room" save="saved">
        <ProjectName />
      </ProjectStatusProvider>,
    );
    const link = screen.getByRole('link', { name: 'Gaming room' });
    expect(link.getAttribute('href')).toMatch(/^\/projects\/?$/);
  });

  it('keeps a link to all the projects next to the name', () => {
    setup();
    const link = screen.getByRole('link', { name: 'All projects' });
    expect(link.getAttribute('href')).toMatch(/^\/projects\/?$/);
  });

  it('Enter saves the new name, trimmed, and gives the keyboard back to the name', async () => {
    const { onRename, user } = setup();
    await user.click(nameButton());
    expect(field()).toHaveValue('Gaming room');
    expect(field()).toHaveAttribute('maxLength', '80');
    await user.clear(field());
    await user.type(field(), '  Studio  {Enter}');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Studio');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(nameButton()).toHaveFocus();
  });

  it('leaving the field saves too', async () => {
    const { onRename, user } = setup();
    await user.click(nameButton());
    await user.type(field(), ' 2');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Gaming room 2');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('Esc cancels without renaming', async () => {
    const { onRename, user } = setup();
    await user.click(nameButton());
    await user.type(field(), ' 2{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(nameButton()).toHaveFocus();
  });

  it('works from the keyboard alone', async () => {
    const { onRename, user } = setup();
    nameButton().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('Office{Enter}'); // the whole name is selected, so typing replaces it
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Office');
  });

  it('an empty name is not saved: Enter says why, leaving the field drops it', async () => {
    const { onRename, user } = setup();
    await user.click(nameButton());
    await user.clear(field());
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Enter a name.');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('a name the storage refuses keeps the field open with the reason', async () => {
    const onRename = vi.fn<(name: string) => Promise<void>>(async () => {
      throw new RepositoryError('QUOTA_EXCEEDED', 'full');
    });
    const { user } = setup(onRename);
    await user.click(nameButton());
    await user.type(field(), ' 2{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/space/i);
    expect(field()).toHaveFocus();
  });
});
