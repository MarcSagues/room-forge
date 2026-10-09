import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorShell } from '../shell/editor-shell';
import { ProjectStatusProvider } from './project-status';

/** Pretends the window is wide enough for the docked layout, which is the one with the full bar. */
beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: 1280 >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

const topBar = () => screen.getByRole('banner');

describe('the top bar and the open project', () => {
  it('shows the placeholders it always had when nobody says anything', () => {
    render(<EditorShell />);
    expect(within(topBar()).getByText('Untitled project')).toBeInTheDocument();
    expect(within(topBar()).getByRole('status')).toHaveTextContent('Saved');
  });

  it('shows the name of the project, as a way back to all the projects', () => {
    render(
      <ProjectStatusProvider name="Gaming room" save="saved">
        <EditorShell />
      </ProjectStatusProvider>,
    );
    const link = within(topBar()).getByRole('link', { name: 'Gaming room' });
    expect(link.getAttribute('href')).toMatch(/^\/projects\/?$/);
    expect(link).toHaveAttribute('title', 'All projects');
  });

  it.each([
    ['saving', 'Saving…'],
    ['dirty', 'Unsaved changes'],
    ['error', 'Not saved'],
  ] as const)('shows the save state %s', (save, text) => {
    render(
      <ProjectStatusProvider name="Office" save={save}>
        <EditorShell />
      </ProjectStatusProvider>,
    );
    expect(within(topBar()).getByRole('status')).toHaveTextContent(text);
  });

  it('follows the state as it changes', () => {
    const { rerender } = render(
      <ProjectStatusProvider name="Office" save="dirty">
        <EditorShell />
      </ProjectStatusProvider>,
    );
    rerender(
      <ProjectStatusProvider name="Office" save="saved">
        <EditorShell />
      </ProjectStatusProvider>,
    );
    expect(within(topBar()).getByRole('status')).toHaveTextContent('Saved');
  });
});
