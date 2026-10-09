import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopBar } from '../shell/top-bar';
import { ProjectStatusProvider } from './project-status';

const bar = (
  <TopBar
    leftExpanded
    rightExpanded
    onToggleLeft={() => {}}
    onToggleRight={() => {}}
    leftPanelId="l"
    rightPanelId="r"
  />
);

describe('the top bar and the open project', () => {
  it('shows the placeholders it always had when nobody says anything', () => {
    render(bar);
    expect(screen.getByText('Untitled project')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('shows the name of the project, as a way back to all the projects', () => {
    render(
      <ProjectStatusProvider name="Gaming room" save="saved">
        {bar}
      </ProjectStatusProvider>,
    );
    const link = screen.getByRole('link', { name: 'Gaming room' });
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
        {bar}
      </ProjectStatusProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('follows the state as it changes', () => {
    const { rerender } = render(
      <ProjectStatusProvider name="Office" save="dirty">
        {bar}
      </ProjectStatusProvider>,
    );
    rerender(
      <ProjectStatusProvider name="Office" save="saved">
        {bar}
      </ProjectStatusProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
