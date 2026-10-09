import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportMenu } from './export-menu';
import { ProjectStatusProvider } from './project-status';

describe('ExportMenu', () => {
  it('is the disabled placeholder when there is no project to export', () => {
    render(<ExportMenu />);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('offers the project file, and exports it when chosen', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <ProjectStatusProvider name="Office" save="saved" onExport={onExport}>
        <ExportMenu />
      </ProjectStatusProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Export' });
    expect(trigger).toBeEnabled();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Project (.roomforge.json)' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <ProjectStatusProvider name="Office" save="saved" onExport={onExport}>
        <ExportMenu />
      </ProjectStatusProvider>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: 'Project (.roomforge.json)' });
    expect(item).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('closes the menu once it has exported', async () => {
    const user = userEvent.setup();
    render(
      <ProjectStatusProvider name="Office" save="saved" onExport={() => {}}>
        <ExportMenu />
      </ProjectStatusProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Project (.roomforge.json)' }));
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});
