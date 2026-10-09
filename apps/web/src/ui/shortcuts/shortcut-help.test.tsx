import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createShortcutRegistry, type ShortcutDef } from '@/editor';
import { ShortcutHelp } from './shortcut-help';
import { ShortcutsProvider } from './shortcuts-context';

const def = (id: string, extra: Partial<ShortcutDef>): ShortcutDef => ({
  id,
  keys: [{ key: id.slice(-1) }],
  category: 'view',
  description: 'shortcut.fit',
  handler: vi.fn(),
  ...extra,
});

function setup(isMac = false) {
  const registry = createShortcutRegistry({ isMac });
  registry.register(
    def('edit.undo', {
      category: 'edit',
      description: 'shortcut.undo',
      keys: [{ mod: true, key: 'z' }],
    }),
  );
  registry.register(
    def('edit.redo', {
      category: 'edit',
      description: 'shortcut.redo',
      keys: [
        { mod: true, shift: true, key: 'z' },
        { ctrl: true, key: 'y' },
      ],
    }),
  );
  registry.register(def('view.fit', { description: 'shortcut.fit', keys: [{ key: 'f' }] }));
  render(
    <ShortcutsProvider registry={registry}>
      <ShortcutHelp />
    </ShortcutsProvider>,
  );
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
    act(() => {
      registry.handle(event);
    });
  };
  return { registry, press };
}

describe('ShortcutHelp', () => {
  it('opens with ? and lists exactly the registered shortcuts, translated, by section', () => {
    const { registry, press } = setup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    press('?', { shiftKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const rows = within(dialog).getAllByRole('listitem');
    // Every registered shortcut, including the one that opened this dialog.
    expect(rows).toHaveLength(registry.list().length);
    expect(within(dialog).getByRole('heading', { name: 'Edit' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'View' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Help' })).toBeInTheDocument();
    expect(within(dialog).getByText('Undo')).toBeInTheDocument();
    expect(within(dialog).getByText('Frame the room')).toBeInTheDocument();
    expect(within(dialog).getByText('Show the keyboard shortcuts')).toBeInTheDocument();
  });

  it('writes Ctrl and Shift on Windows and Linux, with "or" between alternatives', () => {
    const { press } = setup(false);
    press('?');
    const redo = screen.getByText('Redo').closest('li') as HTMLElement;
    expect(within(redo).getAllByText('Ctrl', { selector: 'kbd' })).toHaveLength(2); // Ctrl+Shift+Z, Ctrl+Y
    expect(within(redo).getByText('Shift', { selector: 'kbd' })).toBeInTheDocument();
    expect(within(redo).getAllByText('Z', { selector: 'kbd' })).toHaveLength(1);
    expect(within(redo).getAllByText('Y', { selector: 'kbd' })).toHaveLength(1);
    expect(redo).toHaveTextContent('or');
  });

  it('writes ⇧ and ⌘ on macOS', () => {
    const { press } = setup(true);
    press('?');
    const redo = screen.getByText('Redo').closest('li') as HTMLElement;
    expect(within(redo).getByText('⇧', { selector: 'kbd' })).toBeInTheDocument();
    expect(within(redo).getByText('⌘', { selector: 'kbd' })).toBeInTheDocument();
    expect(within(redo).queryByText('Ctrl', { selector: 'kbd' })).not.toBeInTheDocument();
  });

  it('opens from its button and closes with Escape', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('? toggles it, and other shortcuts do not fire while it is open', async () => {
    const { registry, press } = setup();
    const fit = registry.list().find((shortcut) => shortcut.id === 'view.fit');
    press('?');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // A key pressed inside the dialog is the dialog's.
    const closeButton = within(screen.getByRole('dialog')).getAllByRole('button')[0] as HTMLElement;
    closeButton.focus();
    await userEvent.keyboard('f');
    expect(fit?.handler).not.toHaveBeenCalled();
  });

  it('forgets its shortcut when it is unmounted', () => {
    const registry = createShortcutRegistry({ isMac: false });
    const { unmount } = render(
      <ShortcutsProvider registry={registry}>
        <ShortcutHelp />
      </ShortcutsProvider>,
    );
    expect(registry.list().map((shortcut) => shortcut.id)).toEqual(['help.shortcuts']);
    unmount();
    expect(registry.list()).toHaveLength(0);
  });
});
