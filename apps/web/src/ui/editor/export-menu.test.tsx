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

  it('opens the image export dialog when the app wires one in', async () => {
    const user = userEvent.setup();
    const load = vi.fn(async () => ({
      fileName: () => 'office-2026-10-10.png',
      plan: () => ({ width: 800, height: 600, clamped: false }),
      export: async () => ({ ok: true as const, filename: 'office-2026-10-10.png' }),
    }));
    render(
      <ProjectStatusProvider name="Office" save="saved" onExport={() => {}} imageExport={load}>
        <ExportMenu />
      </ProjectStatusProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Image (.png)…' }));
    expect(await screen.findByRole('dialog', { name: 'Export image' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('has no image entry without an exporter', async () => {
    const user = userEvent.setup();
    render(
      <ProjectStatusProvider name="Office" save="saved" onExport={() => {}}>
        <ExportMenu />
      </ProjectStatusProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Export' }));
    await screen.findByRole('menuitem', { name: 'Project (.roomforge.json)' });
    expect(screen.queryByRole('menuitem', { name: 'Image (.png)…' })).toBeNull();
  });
});
