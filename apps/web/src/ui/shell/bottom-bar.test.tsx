import { createEditorSession, type EditorSession } from '@roomforge/core';
import { buildDocument, createFixtureCatalog } from '@roomforge/core/testing';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createShortcutRegistry, editorShortcuts } from '@/editor';
import { ShortcutsProvider } from '@/ui/shortcuts/shortcuts-context';
import { BottomBar } from './bottom-bar';

let session: EditorSession;

beforeEach(() => {
  session = createEditorSession({
    initialDocument: buildDocument(),
    catalog: createFixtureCatalog(),
  });
});

function renderBar() {
  const registry = createShortcutRegistry({ isMac: false });
  registry.registerAll(editorShortcuts({ session, fit: () => {} }));
  return render(
    <ShortcutsProvider registry={registry}>
      <BottomBar session={session} />
    </ShortcutsProvider>,
  );
}

const snapGroup = () => screen.getByRole('group', { name: 'Snap' });

describe('BottomBar', () => {
  it('turns snap off and on, and follows the G shortcut too', async () => {
    const user = userEvent.setup();
    renderBar();
    const toggle = within(snapGroup()).getByRole('button', { name: 'Snap' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(session.getState().snap.enabled).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    session.setSnap({ enabled: true }); // as the G shortcut does
    expect(await within(snapGroup()).findByRole('button', { name: 'Snap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('chooses the grid size from a menu', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Grid size: 10 cm' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['5 cm', '10 cm', '25 cm', '50 cm']);
    expect(within(menu).getByRole('menuitemradio', { name: '10 cm' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(within(menu).getByRole('menuitemradio', { name: '25 cm' }));
    expect(session.getState().snap.gridStep).toBe(0.25);
    expect(screen.getByRole('button', { name: 'Grid size: 25 cm' })).toBeInTheDocument();
  });

  it('chooses the turn step from a menu, with the keyboard', async () => {
    const user = userEvent.setup();
    renderBar();
    screen.getByRole('button', { name: 'Turn step: 15°' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
    expect(session.getState().snap.angleStepDeg).toBe(90);
    expect(screen.getByRole('button', { name: 'Turn step: 90°' })).toBeInTheDocument();
  });

  it('switches the view, and shows the one the 1 and 2 keys chose', async () => {
    const user = userEvent.setup();
    renderBar();
    const view = screen.getByRole('group', { name: 'View' });
    const perspective = within(view).getByRole('button', { name: 'Perspective' });
    const top = within(view).getByRole('button', { name: 'Top' });
    expect(perspective).toHaveAttribute('aria-pressed', 'true');
    await user.click(top);
    expect(session.getState().view).toBe('top');
    expect(top).toHaveAttribute('aria-pressed', 'true');
    expect(perspective).toHaveAttribute('aria-pressed', 'false');
    session.setView('perspective');
    expect(await within(view).findByRole('button', { name: 'Perspective' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('chooses how the walls are drawn', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole('button', { name: 'Walls: Cutaway' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Down' }));
    expect(session.getState().wallMode).toBe('down');
    expect(screen.getByRole('button', { name: 'Walls: Down' })).toBeInTheDocument();
  });

  it('names its shortcut in the tooltip', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.hover(within(snapGroup()).getByRole('button', { name: 'Snap' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Snap');
    expect(within(tip).getByText('G')).toBeInTheDocument();
  });

  it('keeps day/night and the lights as placeholders until P5-09', () => {
    renderBar();
    const lighting = screen.getByRole('group', { name: 'Lighting' });
    for (const button of within(lighting).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('without a session, shows disabled placeholders', () => {
    render(<BottomBar />);
    expect(within(snapGroup()).getByRole('button', { name: 'Snap' })).toBeDisabled();
  });
});
